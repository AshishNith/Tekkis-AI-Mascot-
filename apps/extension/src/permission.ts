const result = document.getElementById("result")!;

async function requestMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    result.className = "ok";
    result.textContent = "All set! You can close this tab and talk to Tekkie on any page.";
  } catch {
    result.className = "bad";
    result.textContent =
      "The microphone is blocked. Click the lock icon in the address bar, set Microphone to Allow, then try again.";
  }
}

document.getElementById("allow")!.addEventListener("click", requestMic);
void requestMic();
