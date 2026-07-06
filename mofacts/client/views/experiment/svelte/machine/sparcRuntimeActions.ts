import { assign, type ActionArgs } from './contentRuntimeMachineActionTypes';

export const applySparcActionResult = assign({
  sparcNodeValues: ({ context, event }: ActionArgs) => ({
    ...(context.sparcNodeValues || {}),
    ...(event?.sparcNodeValues || {}),
  }),
});
