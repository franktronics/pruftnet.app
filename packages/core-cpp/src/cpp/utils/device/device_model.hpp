#pragma once
#include <string>

class DeviceModel {
private:
  std::string mac;
  std::string ip;

public:
  DeviceModel() = default;
  DeviceModel(const std::string& mac, const std::string& ip);
  std::string getMac() const;
  std::string getIp() const;
  void setMac(const std::string& mac);
  void setIp(const std::string& ip);
  void toString() const;
};