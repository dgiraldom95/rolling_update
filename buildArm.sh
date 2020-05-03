#!/bin/bash


docker build -t dgiraldom/arm_iot_edge:1 -f ./app/arm.Dockerfile ./app
docker push dgiraldom/arm_iot_edge:1