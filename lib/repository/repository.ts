import Schema from "../schema/schema";
import Client from "../client";
import Entity from '../entity/entity';
import Search from '../search/search';

import { EntityData } from '../entity/entity';
import HashConverter from "./hash-converter";
import JsonConverter from "./json-converter";

/**
 * A repository is the main interaction point for reading, writing, and
 * removing {@link Entity | Entities} from Redis. Create one by passing
 * in a {@link Schema} and a {@link Client}. Then use the {@link Repository.fetch},
 * {@link Repository.save}, and {@link Repository.remove} methods to manage your
 * data:
 * 
 * ```typescript
 * let repository = new Repository<Foo>(schema, client);
 * 
 * let foo = await repository.fetch('01FK6TCJBDK41RJ766A4SBWDJ9');
 * foo.aString = 'bar';
 * foo.aBoolean = false;
 * await repository.save(foo);
 * ```
 * 
 * Be sure to use the repository to create a new instance of {@link Entity} you want
 * to create before you save it:
 
 * ```typescript
 * let foo = await repository.createEntity();
 * foo.aString = 'bar';
 * foo.aBoolean = false;
 * await repository.save(foo);
 * ```
 * 
 * If you want to the {@link Repository.search} method, you need to create an index
 * first, and you need RediSearch or RedisJSON installed on your instance of Redis:
 * 
 * ```typescript
 * await repository.createIndex();
 * let entities = await repository.search()
 *   .where('aString').eq('bar')
 *   .and('aBoolean').is.false().returnAll();
 * ```
 * 
 * @template TEntity The type of {@link Entity} that this repository manages.
 */
export default class Repository<TEntity extends Entity> {
  private schema: Schema<TEntity>;
  private client: Client;
  private jsonConverter: JsonConverter;
  private hashConverter: HashConverter;

  /**
   * Constructs a new Repository.
   * @template TEntity The type of {@link Entity} that this repository manages.
   * @param schema The {@link Schema} for this Repository.
   * @param client An open {@link Client}.
   */
  constructor(schema: Schema<TEntity>, client: Client) {
    this.schema = schema;
    this.client = client;
    this.jsonConverter = new JsonConverter(this.schema.definition);
    this.hashConverter = new HashConverter(this.schema.definition);
  }

  /**
   * Creates an index in Redis for use by the {@link Repository.search} method. Requires
   * that RediSearch or RedisJSON is installed on your instance of Redis.
   */
  async createIndex() {
    await this.client.createIndex(
      this.schema.indexName,
      this.schema.dataStructure,
      `${this.schema.prefix}:`,
      this.schema.redisSchema);
  }

  /**
   * Removes an existing index from Redis. Use this method if you want to swap out you index
   * because your {@link Entity} has changed. Requires that RediSearch or RedisJSON is installed
   * on your instance of Redis.
   */
  async dropIndex() {
    try {
      await this.client.dropIndex(this.schema.indexName);
    } catch (e) {
      if (e instanceof Error && e.message === "Unknown Index name") {
        // no-op: the thing we are dropping doesn't exist
      } else {
        throw e
      }
    }
  }

  /**
   * Creates an empty {@link Entity} with a populated {@link Entity.entityId} property.
   * @returns A newly created Entity.
   */
  createEntity(): TEntity {
    let id = this.schema.generateId();
    return new this.schema.entityCtor(id);
  }

  /**
   * Save the {@link Entity} to Redis. If it already exists, it will be updated. If it doesn't
   * exist, it will be created.
   * @param entity The Entity to save.
   * @returns The ID of the Entity just saved.
   */
  async save(entity: TEntity): Promise<string> {

    let key = this.makeKey(entity.entityId);

    if (Object.keys(entity.entityData).length === 0) {
      await this.client.unlink(key);
      return entity.entityId;
    }

    if (this.schema.dataStructure === 'JSON') {
      let jsonData = this.jsonConverter.toJsonData(entity.entityData);
      await this.client.jsonset(key, jsonData);
    } else {
      let hashData = this.hashConverter.toHashData(entity.entityData);
      await this.client.hsetall(key, hashData);
    }

    return entity.entityId;
  }

  /**
   * Read and return an {@link Entity} from Redis with the given id. If
   * the {@link Entity} is not found, returns an {@link Entity} with all
   * properties set to `null`.
   * @param id The ID of the {@link Entity} you seek.
   * @returns The matching Entity.
   */
  async fetch(id: string): Promise<TEntity> {
    let key = this.makeKey(id);
    let entityData: EntityData = {};
    
    if (this.schema.dataStructure === 'JSON') {
      let jsonData = await this.client.jsonget(key);
      entityData = this.jsonConverter.toEntityData(jsonData);
    } else {
      let hashData = await this.client.hgetall(key);
      entityData = this.hashConverter.toEntityData(hashData);
    }

    let entity = new this.schema.entityCtor(id, entityData);
    return entity;
  }

  /**
   * Remove an {@link Entity} from Redis with the given id. If the {@link Entity} is
   * not found, does nothing.
   * @param id The ID of the {@link Entity} you with to delete.
   */
  async remove(id: string): Promise<void> {
    let key = this.makeKey(id);
    await this.client.unlink(key);
  }

  /**
   * Kicks off the processes of building a query. Requires that RediSearch or
   * RedisJSON is installed on your instance of Redis.
   * @template TEntity The type of {@link Entity} sought.
   * @returns A {@link Search} object.
   */
  search(): Search<TEntity> {
    return new Search<TEntity>(this.schema, this.client);
  }

  private makeKey(id: string): string {
    return `${this.schema.prefix}:${id}`;
  }
}
