// Push notification service using Firebase Cloud Messaging (FCM)
// We'll add full FCM setup in Step 6 — for now this is a placeholder

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  // TODO: implement FCM in Step 6
  console.log(`[FCM] → ${fcmToken.slice(0, 20)}... | ${title} | ${body}`)
}
