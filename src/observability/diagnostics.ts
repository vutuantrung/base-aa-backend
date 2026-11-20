export type Diagnostics = {
  info(message: string): void;
  error(message: string, error: unknown): void;
};

export const consoleDiagnostics: Diagnostics = {
  info: message => console.log(message),
  error: (message, error) => console.error(message, error)
};
