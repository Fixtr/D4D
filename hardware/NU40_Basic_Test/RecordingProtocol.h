#pragma once

enum class RecordingState { IDLE, WAITING_RESULT, RETRY_REQUIRED };
RecordingState recordingState = RecordingState::IDLE;
uint32_t recordingStarted = 0, shakeBlockedUntil = 0;
bool recordingWasConnected = false;
bool shakeGravityReady = false;
float shakeGravity[3] = {};
float shakeLastPeak[3] = {};
uint8_t shakePeaks = 0;
uint32_t shakeWindowStarted = 0, shakeLastPeakAt = 0;
const uint32_t RECORDING_TIMEOUT_MS = 60000;
const float SHAKE_THRESHOLD_G = 0.65f;

void resetShake() {
  shakePeaks = 0;
  shakeGravityReady = false;
}

const char* recordingStateName() {
  switch (recordingState) {
    case RecordingState::WAITING_RESULT: return "WAITING_RESULT";
    case RecordingState::RETRY_REQUIRED: return "RETRY_REQUIRED";
    default: return "IDLE";
  }
}

bool requestRecording(uint32_t now) {
  if (recordingState == RecordingState::WAITING_RESULT) return false;
  if (!Bluefruit.connected() || !bleuart.notifyEnabled()) {
    if (Serial) Serial.println("RECORD BLOCKED: BLE not connected/subscribed");
    return false;
  }
  if (bleuart.write((uint8_t)'s') != 1) {
    if (Serial) Serial.println("RECORD ERROR: s notification not queued");
    return false;
  }
  recordingState = RecordingState::WAITING_RESULT;
  recordingStarted = now;
  setLedFeedback(LedFeedback::RECORDING,now);
  resetShake();
  if (Serial) Serial.println("RECORD TX s: WAITING_RESULT (not a recording-start ACK)");
  return true;
}

void receiveRecordingCommand(char command, uint32_t now) {
  if (command != 'c' && command != 'r') {
    if (Serial && command != '\r' && command != '\n') Serial.println("RECORD ignored unknown BLE byte");
    return;
  }
  if (recordingState != RecordingState::WAITING_RESULT) {
    if (Serial) Serial.println("RECORD ignored c/r: no pending recording");
    return;
  }
  recordingState = command == 'c' ? RecordingState::IDLE : RecordingState::RETRY_REQUIRED;
  setLedFeedback(command=='c'?LedFeedback::COMPLETED:LedFeedback::RETRY,now);
  shakeBlockedUntil = now + 1500;
  resetShake();
  hapticPulseCount = command == 'c' ? 2 : 4;
  hapticOnMs = command == 'c' ? 120 : 60;
  hapticGapMs = command == 'c' ? 160 : 60;
  manualPulse = hapticReady;
  if (Serial) {
    Serial.print("RECORD RX "); Serial.print(command);
    Serial.print(": "); Serial.println(recordingStateName());
  }
}

void updateRecording(uint32_t now) {
  // Windows may retain the physical link after its app exits. CCCD removal
  // also ends the recording session, even while that link remains connected.
  const bool connected = Bluefruit.connected() && bleuart.notifyEnabled();
  if (!connected && recordingWasConnected) {
    recordingState = RecordingState::IDLE;
    setLedFeedback(LedFeedback::OFF,now);
    resetShake();
    if (Serial) Serial.println("RECORD disconnected: pending session canceled");
  }
  recordingWasConnected = connected;
  if (recordingState == RecordingState::WAITING_RESULT && now - recordingStarted >= RECORDING_TIMEOUT_MS) {
    recordingState = RecordingState::RETRY_REQUIRED;
    setLedFeedback(LedFeedback::RETRY,now);
    shakeBlockedUntil = now + 1500;
    resetShake();
    if (Serial) Serial.println("RECORD TIMEOUT: RETRY_REQUIRED; shake to retry");
  }
}

// Three alternating acceleration peaks within 700ms; 20ms IMU polling.
void detectRecordingShake(const float* acceleration, uint32_t now) {
  if (recordingState == RecordingState::WAITING_RESULT || hapticState || manualPulse ||
      (int32_t)(now - shakeBlockedUntil) < 0 || now - lastHapticStart < 1000) {
    resetShake();
    return;
  }
  if (!shakeGravityReady) {
    for (uint8_t i = 0; i < 3; ++i) shakeGravity[i] = acceleration[i];
    shakeGravityReady = true;
    return;
  }
  float motion[3], magnitudeSquared = 0;
  for (uint8_t i = 0; i < 3; ++i) {
    shakeGravity[i] += 0.04f * (acceleration[i] - shakeGravity[i]);
    motion[i] = acceleration[i] - shakeGravity[i];
    magnitudeSquared += motion[i] * motion[i];
  }
  if (shakePeaks && now - shakeWindowStarted > 700) shakePeaks = 0;
  if (magnitudeSquared < SHAKE_THRESHOLD_G * SHAKE_THRESHOLD_G) return;
  if (shakePeaks && now - shakeLastPeakAt < 80) return;
  float dot = 0;
  for (uint8_t i = 0; i < 3; ++i) dot += motion[i] * shakeLastPeak[i];
  if (shakePeaks && dot >= 0) return;
  if (!shakePeaks) shakeWindowStarted = now;
  for (uint8_t i = 0; i < 3; ++i) shakeLastPeak[i] = motion[i];
  shakeLastPeakAt = now;
  if (++shakePeaks >= 3) {
    resetShake();
    shakeBlockedUntil = now + 1500;
    requestRecording(now);
  }
}
