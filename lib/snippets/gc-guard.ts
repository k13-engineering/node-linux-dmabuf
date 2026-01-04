type TInstance = {
  release: () => void;
};

const createGarbageCollectionGuard = <T>({
  createError,
}: {
  createError: (args: { info: T }) => Error,
}) => {

  const instanceFinalizationRegistry = new FinalizationRegistry((info: T) => {
    // this callback is called when a instance is garbage collected without release being called
    throw createError({ info });
  });

  const protect = ({
    release: providedRelease,
    info
  }: { release: () => void; info: T }): TInstance => {
    const release = () => {
      providedRelease();
      instanceFinalizationRegistry.unregister(release);
    };

    instanceFinalizationRegistry.register(release, info, release);

    return {
      release
    };
  };

  return {
    protect
  };
};

const createDefaultGarbageCollectedWithoutReleaseError = ({
  name,
  info,
  releaseFunctionName,
  resourcesName,
}: {
  name: string,
  info: string,
  releaseFunctionName: string,
  resourcesName: string,
}) => {

  let message = `${info} was garbage collected without calling release().`;
  message += ` This would cause a memory leak -`;
  message += ` therefore this raises an uncaught exception.`;
  message += ` Please make sure to call ${releaseFunctionName}() on all ${resourcesName} when you are done with them.`;
  message += ` Underlying resources should have still be cleaned up in case you are catching uncaught exceptions -`;
  message += ` however, do not rely on this behavior (specifically for production code).`;

  const error = Error(message);
  error.name = name;

  return error;
};

export {
  createGarbageCollectionGuard,
  createDefaultGarbageCollectedWithoutReleaseError
};
