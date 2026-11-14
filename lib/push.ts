// Stub. The real push module is part of the private app (server-side sending).
export async function sendPushNotification(_payload: {
  scope: { kind: string; groupId?: string }
  title: string
  body: string
  url: string
}): Promise<void> {}
