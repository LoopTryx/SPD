export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: "second-instance", listener: (_event: unknown, argv: string[]) => void): unknown;
}
export function claimSingleInstance(
  app: SingleInstanceApp,
  onSecondInstance: (argv: string[]) => void,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on("second-instance", (_event, argv) => onSecondInstance(argv));
  return true;
}
