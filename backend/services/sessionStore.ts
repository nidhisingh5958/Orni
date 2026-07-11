class SessionStore {
  private sessions = new Map<string, string>();

  public getSession(assetId: string): string | undefined {
    return this.sessions.get(assetId);
  }

  public setSession(assetId: string, interactionId: string): void {
    this.sessions.set(assetId, interactionId);
  }

  public clearSession(assetId: string): void {
    this.sessions.delete(assetId);
  }
}

export const sessionStore = new SessionStore();
