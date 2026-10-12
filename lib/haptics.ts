// iOS Safari has no Vibration API. Toggling a native switch control makes
// iOS (17.4+) play a system haptic tick, so synthesize one off-screen.
// Android and others get the standard Vibration API first.
export function hapticTick() {
  try {
    if ("vibrate" in navigator && navigator.vibrate(50)) return;
    const sw = document.createElement("input");
    sw.type = "checkbox";
    sw.setAttribute("switch", "");
    sw.style.position = "fixed";
    sw.style.opacity = "0";
    sw.style.pointerEvents = "none";
    document.body.appendChild(sw);
    sw.click();
    sw.remove();
  } catch {
    // Haptics are decoration — never let them break the interaction.
  }
}
