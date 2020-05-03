#!/bin/bash

docker build -t dgiraldom/iot_edge:1 ./app 
docker build -t dgiraldom/iot_edge:2 ./app
docker build -t dgiraldom/monitor ./monitor 
docker build -t dgiraldom/resources ./resources 
docker build -t dgiraldom/thing ./thing
docker push dgiraldom/iot_edge:1
docker push dgiraldom/iot_edge:2
docker push dgiraldom/monitor
docker push dgiraldom/resources
docker push dgiraldom/thing