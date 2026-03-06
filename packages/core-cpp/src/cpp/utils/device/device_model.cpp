#include "device_model.hpp"

DeviceModel::DeviceModel(const std::string& mac, const std::string& ip) : mac(mac), ip(ip) {}
std::string DeviceModel::getMac() const {
  return mac;
}
std::string DeviceModel::getIp() const {
  return ip;
}
void DeviceModel::setMac(const std::string& mac) {
  this->mac = mac;
}
void DeviceModel::setIp(const std::string& ip) {
  this->ip = ip;
}
void DeviceModel::toString() const {
  printf("DeviceModel { mac: %s, ip: %s }\n", mac.c_str(), ip.c_str());
}