#pragma once
const uint8_t TWIST_AXIS=0, YES_AXIS=1, NO_AXIS=2;
// Glove twist axis fitted from five labelled repetitions. Other axes are
// orthogonal provisional axes until glove nod/sideways captures are available.
const float GLOVE_MOTION_AXES[3][3]={
 { .715351f,-.691319f,-.101735f },
 { .694925f, .719082f, .000000f },
 { .073156f,-.070698f, .994812f }
};
enum class RecordingState { IDLE, RECORDING, WAITING_QUESTION, WAITING_ANSWER };
RecordingState recordingState=RecordingState::IDLE;
uint32_t questionStarted=0, shakeBlockedUntil=0;
bool recordingWasConnected=false;
struct GestureTracker {
 bool active=false;
 int8_t direction[3]={};
 uint8_t strokes[3]={};
 float angle[3]={},reverse[3]={},energy[3]={};
 uint32_t started=0,last=0,quiet=0;
} gesture;
float motionFiltered[3]={},motionBias[3]={};
const uint32_t MOTION_CALIBRATION_STILL_MS=10000;
const uint16_t MOTION_CALIBRATION_SAMPLES=500; // 10 seconds at the 20 ms IMU cadence.
uint32_t calibrationStarted=0,calibrationLastSample=0;
uint16_t calibrationSamples=0;
float calibrationSum[3]={},calibrationGyroMin[3]={},calibrationGyroMax[3]={};
float calibrationAccelMin[3]={},calibrationAccelMax[3]={};
float calibrationAccelFiltered[3]={},calibrationGyroFiltered[3]={};
bool calibrationFilterReady=false;

void resetMotionCalibrationWindow(){calibrationSamples=0;calibrationLastSample=0;calibrationFilterReady=false;}
// Re-zero gyro drift only from a continuous, stable, gravity-only sample window.
// Keep thresholds, board axes and recording/question state unchanged.
bool updateMotionCalibration(const float* acceleration,const float* gyro,uint32_t now){
 if(gesture.active){resetMotionCalibrationWindow();return false;}
 if(calibrationSamples && (uint32_t)(now-calibrationLastSample)>60)resetMotionCalibrationWindow();
 float gravity=0;
 for(uint8_t i=0;i<3;++i){
  if(!isfinite(acceleration[i])||!isfinite(gyro[i])||fabsf(gyro[i]-motionBias[i])>30){resetMotionCalibrationWindow();return false;}
 }
 for(uint8_t i=0;i<3;++i){
  if(!calibrationFilterReady){calibrationAccelFiltered[i]=acceleration[i];calibrationGyroFiltered[i]=gyro[i];}
  else{
   calibrationAccelFiltered[i]+=.15f*(acceleration[i]-calibrationAccelFiltered[i]);
   calibrationGyroFiltered[i]+=.15f*(gyro[i]-calibrationGyroFiltered[i]);
  }
 }
 calibrationFilterReady=true;
 for(uint8_t i=0;i<3;++i){
  if(fabsf(calibrationGyroFiltered[i])>14 || fabsf(calibrationGyroFiltered[i]-motionBias[i])>10){resetMotionCalibrationWindow();return false;}
  gravity+=calibrationAccelFiltered[i]*calibrationAccelFiltered[i];
 }
 if(gravity<.81f||gravity>1.21f){resetMotionCalibrationWindow();return false;}
 if(calibrationSamples){
  for(uint8_t i=0;i<3;++i){
   const float gyroLow=fminf(calibrationGyroMin[i],calibrationGyroFiltered[i]),gyroHigh=fmaxf(calibrationGyroMax[i],calibrationGyroFiltered[i]);
   const float accelLow=fminf(calibrationAccelMin[i],calibrationAccelFiltered[i]),accelHigh=fmaxf(calibrationAccelMax[i],calibrationAccelFiltered[i]);
   if(gyroHigh-gyroLow>8.0f||accelHigh-accelLow>.05f){resetMotionCalibrationWindow();return false;}
  }
 }
 for(uint8_t i=0;i<3;++i){
  if(!calibrationSamples){
   calibrationStarted=now;
   calibrationSum[i]=0;
   calibrationGyroMin[i]=calibrationGyroMax[i]=calibrationGyroFiltered[i];
   calibrationAccelMin[i]=calibrationAccelMax[i]=calibrationAccelFiltered[i];
  }
  calibrationSum[i]+=gyro[i];
  calibrationGyroMin[i]=fminf(calibrationGyroMin[i],calibrationGyroFiltered[i]);calibrationGyroMax[i]=fmaxf(calibrationGyroMax[i],calibrationGyroFiltered[i]);
  calibrationAccelMin[i]=fminf(calibrationAccelMin[i],calibrationAccelFiltered[i]);calibrationAccelMax[i]=fmaxf(calibrationAccelMax[i],calibrationAccelFiltered[i]);
 }
 calibrationLastSample=now;
 ++calibrationSamples;
 if(calibrationSamples<MOTION_CALIBRATION_SAMPLES || (uint32_t)(now-calibrationStarted)<MOTION_CALIBRATION_STILL_MS)return false;
 for(uint8_t i=0;i<3;++i)motionBias[i]=calibrationSum[i]/calibrationSamples;
 resetMotionCalibrationWindow();
 if(Serial){Serial.print("IMU CALIBRATED bias=");for(uint8_t i=0;i<3;++i){Serial.print(motionBias[i],3);Serial.print(i==2?'\n':',');}}
 return true;
}

void resetShake(){gesture=GestureTracker{};for(uint8_t i=0;i<3;++i)motionFiltered[i]=0;}
const char* recordingStateName(){switch(recordingState){case RecordingState::RECORDING:return "RECORDING";case RecordingState::WAITING_QUESTION:return "WAITING_QUESTION";case RecordingState::WAITING_ANSWER:return "WAITING_ANSWER";default:return "IDLE";}}
void motionFeedback(uint8_t count,bool fast=false){hapticPulseCount=count;hapticOnMs=fast?60:100;hapticGapMs=fast?60:140;manualPulse=hapticReady;}
bool dispatchGesture(uint8_t axis,uint32_t now){
 char signal=0;RecordingState next=recordingState;
 if(axis==TWIST_AXIS && recordingState!=RecordingState::WAITING_ANSWER){signal=recordingState==RecordingState::RECORDING?'e':'s';next=signal=='s'?RecordingState::RECORDING:RecordingState::WAITING_QUESTION;}
 else if(recordingState==RecordingState::WAITING_ANSWER){if(axis==YES_AXIS)signal='y';else if(axis==NO_AXIS)signal='n';next=RecordingState::IDLE;}
 if(!signal){if(Serial)Serial.println("RECORD IGNORED: gesture unavailable; y/n require q, twist blocked during question");return false;}
 if(!Bluefruit.connected()||!bleuart.notifyEnabled()){if(Serial)Serial.println("RECORD BLOCKED: BLE not connected/subscribed");return false;}
 if(bleuart.write((uint8_t)signal)!=1){if(Serial)Serial.println("RECORD ERROR: notification not queued");return false;}
 recordingState=next;shakeBlockedUntil=now+1000;resetShake();
 setLedFeedback(signal=='s'?LedFeedback::RECORDING:signal=='n'?LedFeedback::RETRY:LedFeedback::COMPLETED,now);
 motionFeedback(signal=='y'?2:signal=='n'?4:1,signal=='n');
 if(Serial){Serial.print("RECORD TX ");Serial.print(signal);Serial.print(": ");Serial.println(recordingStateName());}return true;
}
bool requestRecording(uint32_t now){return dispatchGesture(TWIST_AXIS,now);}
void receiveRecordingCommand(char command,uint32_t now){
 // UI authoritative recording state: covers button/keyboard and auto re-record.
 if(command=='a' || command=='z'){
  recordingState=command=='a'?RecordingState::RECORDING:RecordingState::IDLE;
  resetShake();setLedFeedback(command=='a'?LedFeedback::RECORDING:LedFeedback::OFF,now);
  if(Serial){Serial.print("RECORD RX ");Serial.print(command);Serial.print(": ");Serial.println(recordingStateName());}
  return;
 }
 if(command!='q'){if(Serial)Serial.println("RECORD ignored unknown BLE byte (v2 accepts q only)");return;}
 if(recordingState==RecordingState::RECORDING||recordingState==RecordingState::WAITING_ANSWER){if(Serial)Serial.println("RECORD ignored q: recording active or question already pending");return;}
 recordingState=RecordingState::WAITING_ANSWER;questionStarted=now;shakeBlockedUntil=now+1000;resetShake();
 setLedFeedback(LedFeedback::RETRY,now);motionFeedback(3);
 if(Serial)Serial.println("RECORD RX q: WAITING_ANSWER; nod=yes / sideways=no");
}
void updateRecording(uint32_t now){
 const bool connected=Bluefruit.connected()&&bleuart.notifyEnabled();
 if(!connected&&recordingWasConnected){recordingState=RecordingState::IDLE;setLedFeedback(LedFeedback::OFF,now);resetShake();if(Serial)Serial.println("RECORD disconnected: session canceled");}
 recordingWasConnected=connected;
 if(recordingState==RecordingState::WAITING_ANSWER&&now-questionStarted>=30000){recordingState=RecordingState::IDLE;setLedFeedback(LedFeedback::OFF,now);resetShake();if(Serial)Serial.println("RECORD TIMEOUT: question canceled; no answer sent");}
}
// Classify the whole motion window. Small reversals do not cancel a stroke.
void detectRecordingMotion(const float* acceleration,const float* gyro,uint32_t now){
 if(hapticState||manualPulse||(int32_t)(now-shakeBlockedUntil)<0||now-lastHapticStart<1000){resetMotionCalibrationWindow();resetShake();return;}
 if(updateMotionCalibration(acceleration,gyro,now)){resetShake();return;}
 float peak=0;
 for(uint8_t i=0;i<3;++i){
  float rate=0;
  for(uint8_t j=0;j<3;++j)rate+=GLOVE_MOTION_AXES[i][j]*(gyro[j]-motionBias[j]);
  motionFiltered[i]+=.35f*(rate-motionFiltered[i]);
  if(fabsf(motionFiltered[i])>peak)peak=fabsf(motionFiltered[i]);
 }
 const uint32_t dt=gesture.last?now-gesture.last:20;gesture.last=now;
 if(dt>60){resetShake();return;}
 if(!gesture.active){if(peak<15)return;gesture.active=true;gesture.started=now;}
 for(uint8_t i=0;i<3;++i){
  const float rate=motionFiltered[i],step=fabsf(rate)*dt/1000.0f;
  gesture.energy[i]+=step;
  if(fabsf(rate)<10)continue;
  const int8_t sign=rate>0?1:-1;
  if(!gesture.direction[i])gesture.direction[i]=sign;
  if(sign==gesture.direction[i]){gesture.angle[i]+=step;gesture.reverse[i]=0;}
  else{
   gesture.reverse[i]+=step;
   const float minimumAngle=i==TWIST_AXIS?5.0f:8.0f;
   if(gesture.reverse[i]>=minimumAngle){
    if(gesture.angle[i]>=minimumAngle)++gesture.strokes[i];
    gesture.direction[i]=sign;gesture.angle[i]=gesture.reverse[i];gesture.reverse[i]=0;
   }
  }
 }
 if(peak<12){if(!gesture.quiet)gesture.quiet=now;}else gesture.quiet=0;
 const bool quiet=gesture.quiet&&now-gesture.quiet>=180;
 if(!quiet && now-gesture.started<5000)return;
 uint8_t axis=0;for(uint8_t i=1;i<3;++i)if(gesture.energy[i]>gesture.energy[axis])axis=i;
 const float minimumAngle=axis==TWIST_AXIS?5.0f:8.0f;
 const uint8_t strokes=gesture.strokes[axis]+(gesture.angle[axis]>=minimumAngle?1:0);
 float other=0;for(uint8_t i=0;i<3;++i)if(i!=axis)other+=gesture.energy[i];
 const float dominance=gesture.energy[axis]/(other>1?other:1);
 const bool countMatches=strokes>=2 && strokes<=(axis==TWIST_AXIS?3:8) && gesture.energy[axis]>=(axis==TWIST_AXIS?12.0f:16.0f);
 const float minimumDominance=axis==NO_AXIS?.75f:1.15f;
 const bool accepted=quiet&&dominance>=minimumDominance&&countMatches;
 if(Serial){Serial.print("MOTION WINDOW axis=");Serial.print(axis);Serial.print(" strokes=");Serial.print(strokes);Serial.print(" dominance=");Serial.print(dominance);Serial.print(" accepted=");Serial.println(accepted);}
 resetShake();
 if(!accepted)return;
 if(Serial){Serial.print("MOTION DETECTED ");Serial.println(axis==TWIST_AXIS?(recordingState==RecordingState::RECORDING?"e":"s"):axis==YES_AXIS?"y":"n");}
 shakeBlockedUntil=now+700;dispatchGesture(axis,now);
}
