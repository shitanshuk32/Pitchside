import { api } from "./api";

export const reportEngagement = async (type, getToken, isSignedIn) => {
  if (!isSignedIn) return;
  try {
    const token = await getToken();
    await api.recordEngagementActivity(type, token);
    window.dispatchEvent(new CustomEvent("pitchside:engagement"));
  } catch {
    // Non-blocking — game and feed should keep working offline.
  }
};
