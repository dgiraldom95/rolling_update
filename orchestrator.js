const execCommand = require('child_process').exec;
const axios = require('axios');
const fs = require('fs');

let version;
let prevVersion;
let imageName;
const globalMonitorUrl = 'http://localhost:8000';
const apiKey = fs.readFileSync('./apiKey.txt').toString();

const appServiceName = 'iot_app';
const monitorServiceName = 'iot_monitor';
const resourceServiceName = 'iot_resources';
const mongoServiceName = 'iot_mongo';
const thingServiceName = 'iot_thing';

const exec = async (command) => {
    return new Promise((resolve, reject) => {
        execCommand(command, function (error, stdout, stderr) {
            if (stderr) {
                console.log('COMMAND ERR: ', stderr);
                reject(stderr);
            }
            resolve(stdout);
        });
    });
};

const createSwarm = async () => {
    let r = await exec('docker swarm init');
    console.log('JOIN SWARM: ', r);
};

const createAppService = async () => {
    let r = await exec(`docker service create \
    --detach \
    --name ${appServiceName} \
    --replicas 5 \
    --update-delay 1s \
    --rollback-delay 1s \
    --update-failure-action "rollback" \
    --publish 3000:3000 \
    --network iot_overlay \
    --env APP_VERSION=${version} \
    ${imageName}:${version}`);
    console.log('CREATE APP SERVICE: ', r);
};

const createResourceReportingService = async () => {
    let r = await exec(`docker service create \
    --detach \
    --name ${resourceServiceName} \
    --mode global \
    --mount type=bind,source=/var/run/docker.sock,destination=/var/run/docker.sock \
    --network iot_overlay \
    dgiraldom/resources`);
    console.log('CREATE RESOURCE SERVICE: ', r);
};

const createMonitorService = async () => {
    let r = await exec(`docker service create \
    --detach \
    --name ${monitorServiceName} \
    --replicas 1 \
    --publish 3001:3001 \
    --network iot_overlay \
    --env apiKey=${apiKey} \
    dgiraldom/monitor`);

    console.log('CREATE MONITOR SERVICE: ', r);
};

const createMongoService = async () => {
    let r = await exec(`docker service create \
    --detach \
    --name ${mongoServiceName} \
    --replicas 1 \
    --publish 27017:27017 \
    --network iot_overlay \
    mvertes/alpine-mongo`);

    console.log('CREATE DB SERVICE: ', r);
};

const createThingService = async () => {
    let r = await exec(`docker service create \
        --detach \
        --name ${thingServiceName} \
        --replicas 1 \
        --publish 3003:3003 \
        --network iot_overlay \
        dgiraldom/thing`);

    console.log('CREATE THING SERVICE: ', r);
};

const updateService = async () => {
    let r = await exec(`docker service update \
    --detach \
    --update-failure-action "rollback" \
    --image dgiraldom/iot_edge:${version} \
    --env-add APP_VERSION=${version} \
    ${appServiceName}`);
    console.log('SERVICE UPDATE: ', r);
};

const createOverlayNetwork = async () => {
    let r = await exec(`docker network create --driver overlay iot_overlay`);
    console.log('OVERLAY NETWORK: ', r);
};

const stackDeploy = async () => {
    console.log('CREATING STACK');
    await createOverlayNetwork();
    await Promise.all([
        createMongoService(),
        createAppService(),
        createMonitorService(),
        createResourceReportingService(),
        createThingService(),
    ]);
};

const sendRollbackRequest = async () => {
    let r = await exec(`docker service rollback --detach ${appServiceName}`);
    console.log('SERVICE ROLLBACK: ', r);
};

const checkRollbackStatus = async () => {
    try {
        if (prevVersion && prevVersion !== version) {
            const healthCheckResponse = await axios.get(`${globalMonitorUrl}/health-report/${version}`, {
                headers: apiKey,
            });
            const data = healthCheckResponse.data;
            console.log('VERSION STATUS: ', data);
            if (data.status === 'rollback') {
                console.log('PERFORMING ROLLBACK');
                await sendRollbackRequest();
                version = prevVersion;
            }
        }
    } catch (e) {
        console.log('Rollback check error: ', e);
    }
};

const checkForUpdates = async () => {
    try {
        const updateResponse = await axios.get(`${globalMonitorUrl}/version`);
        const data = updateResponse.data;
        if (data.version > version) {
            prevVersion = version;
            version = data.version;
            console.log(`Updating to newest version ${data.version}`);
            await updateService();
        } else console.log('Already on newest version');
    } catch (e) {
        console.log('Update check error: ', e);
    }
};

const init = async () => {
    const initInfo = await axios.get(`${globalMonitorUrl}/init`);
    const data = initInfo.data;
    ({ imageName, version } = data);
    try {
        await createSwarm();
    } catch (e) {
        console.log('Already part of swarm - skipping init');
        return;
    }
    await stackDeploy();
};

init();
setInterval(checkRollbackStatus, 10000);
setInterval(checkForUpdates, 10000);
