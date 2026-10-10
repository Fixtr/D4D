#pragma once
// Register layouts: TDK MPU-6050 and ST LSM6DS3 family.
struct ImuDevice { uint8_t address, id; bool mpu; bool ready; };
ImuDevice imus[4] = {};
uint8_t imuCount = 0;
bool imuStreaming = false;
uint32_t lastImuSample = 0;
uint32_t lastImuOutput = 0;

bool imuRead(uint8_t address, uint8_t reg, uint8_t* data, uint8_t length) {
  Wire.beginTransmission(address); Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address, length) != length) return false;
  for (uint8_t i=0; i<length; ++i) data[i]=Wire.read();
  return true;
}
bool imuWrite(uint8_t address, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(address); Wire.write(reg); Wire.write(value);
  return Wire.endTransmission()==0;
}
void initImus() {
  const uint8_t addresses[] = {0x68, 0x69, 0x6A, 0x6B};
  for (uint8_t address : addresses) {
    uint8_t id=0;
    const bool mpu=address==0x68 || address==0x69;
    if (!imuRead(address, mpu ? 0x75 : 0x0F, &id, 1)) continue;
    if ((mpu && id!=0x68) || (!mpu && id!=0x69 && id!=0x6A && id!=0x6C)) continue;
    bool ready;
    if (mpu) {
      ready=imuWrite(address,0x6B,0x01) && imuWrite(address,0x1A,0x03) &&
          imuWrite(address,0x19,9) && imuWrite(address,0x1B,0) && imuWrite(address,0x1C,0);
    } else {
      ready=imuWrite(address,0x12,0x44) && imuWrite(address,0x10,0x40) && imuWrite(address,0x11,0x40);
    }
    imus[imuCount++]={address,id,mpu,ready};
  }
}
void printImuInfo() {
  Serial.println("IMU monitor: interval=100ms; acceleration=g (includes gravity); gyro=deg/s");
  for (uint8_t address=1; address<127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission()==0) { Serial.print("I2C FOUND 0x"); Serial.println(address,HEX); }
    updateLedFeedback(millis());
    updateHaptic(millis());
  }
  for (uint8_t i=0; i<imuCount; ++i) {
    Serial.print("IMU "); Serial.print(imus[i].mpu ? "MPU6050" : "LSM6 family");
    Serial.print(" address=0x"); Serial.print(imus[i].address,HEX);
    Serial.print(" WHO_AM_I=0x"); Serial.print(imus[i].id,HEX);
    Serial.print(" ready="); Serial.println(imus[i].ready);
  }
  if (!imuCount) Serial.println("ERROR NO_SUPPORTED_IMU");
}
int16_t imuWord(const uint8_t* data, bool bigEndian) {
  return (int16_t)(bigEndian ? ((uint16_t)data[0]<<8)|data[1] : ((uint16_t)data[1]<<8)|data[0]);
}
void updateImus(uint32_t now) {
  if (now-lastImuSample<20) return;
  lastImuSample=now;
  const bool printSample = imuStreaming && Serial && now-lastImuOutput>=100;
  if (printSample) lastImuOutput=now;
  for (uint8_t i=0;i<imuCount;++i) {
    const ImuDevice& imu=imus[i];
    if (!imu.ready) continue;
    uint8_t data[14];
    if (!imuRead(imu.address,imu.mpu?0x3B:0x22,data,imu.mpu?14:12)) {
      if (Serial) Serial.println("ERROR IMU_READ_FAILED");
      resetShake(); continue;
    }
    char line[160];
    float accel[3],gyro[3];
    for (uint8_t axis=0;axis<3;++axis) {
      accel[axis]=imuWord(data+(imu.mpu?0:6)+axis*2,imu.mpu)*(imu.mpu?1.0f/16384:0.000061f);
      gyro[axis]=imuWord(data+(imu.mpu?8:0)+axis*2,imu.mpu)*(imu.mpu?1.0f/131:0.00875f);
    }
    if (i==0) detectRecordingShake(accel,now);
    if (!printSample) continue;
    snprintf(line,sizeof(line),"t=%lu addr=0x%02X A[g] x=%+.3f y=%+.3f z=%+.3f G[dps] x=%+.2f y=%+.2f z=%+.2f\n",
        (unsigned long)now,imu.address,accel[0],accel[1],accel[2],gyro[0],gyro[1],gyro[2]);
    if (Serial.availableForWrite()>=strlen(line)) Serial.print(line);
  }
}
