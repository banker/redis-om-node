[redis-om](../README.md) / Entity

# Class: Entity

An Entity is the class from which objects that Redis OM maps to are made. You need
to subclass Entity in your application:

```typescript
class Foo extends Entity {}
```

## Table of contents

### Properties

- [entityId](Entity.md#entityid)

## Properties

### entityId

• `Readonly` **entityId**: `string`

The generated entity ID.

#### Defined in

[lib/entity/entity.ts:22](https://github.com/redis/redis-om-node/blob/20e6b1d/lib/entity/entity.ts#L22)
