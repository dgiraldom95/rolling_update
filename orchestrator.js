const http = require('http');
const readline = require('readline');
const execCommand = require('child_process').exec;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const appServiceName = 'iot_app';
const monitorServiceName = 'iot_monitor';
const resourceServiceName = 'iot_resources';
const mongoServiceName = 'iot_mongo';

let latestAppVersion = 2;

const exec = async command => {
    return new Promise((resolve, reject) => {
        execCommand(command, function(error, stdout, stderr) {
            if (stderr) {
                console.log('COMMAND ERR: ', stderr);
                reject(stderr);
            }
            resolve(stdout);
        });
    });
};

const leaveSwarm = async () => {
    let r = await exec('docker swarm leave -f');
    console.log('LEAVE SWARM: ', r);
};

const joinSwarm = async () => {
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
    dgiraldom/node-test-1:working`);
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

const updateService = async () => {
    let r = await exec(`docker service update \
    --detach \
    --update-failure-action "rollback" \
    --image dgiraldom/node-test-1:failing \
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
    await createMongoService();
    await createAppService();
    await createMonitorService();
    await createResourceReportingService();
};

const sendRollbackRequest = async () => {
    let r = await exec(`docker service rollback --detach ${appServiceName}`);
    console.log('SERVICE ROLLBACK: ', r);
};

const checkRollbackStatus = async (id, version) => {
    options = {
        host: 'localhost',
        port: 3001,
        path: `/health-report/${latestAppVersion}`,
        method: 'GET',
    };

    sendRollbackRequest(id, version);

    // const req = http.request(options, res => {
    //     res.setEncoding('utf8');
    //     res.on('data', d => {
    //         const result = JSON.parse(d);
    //         console.warn('VERSION STATUS: ', result.status);
    //         console.log(result);
    //         if (result.status === 'rollback') {
    //             console.error('PERFORMING ROLLBACK');
    //             sendRollbackRequest(id, version);
    //         }
    //     });
    // });
    // req.end();
};

const main = async () => {
    while (true) {
        const op = await new Promise((resolve, reject) => {
            rl.question(
                `1. Leave swarm
2. Create swarm
3. Stack deploy
4. Update app
5. Rollback
6. Query monitor\n :
`,
                async answer => {
                    resolve(Number(answer));
                },
            );
        });

        try {
            let id, version;
            switch (op) {
                case 1:
                    leaveSwarm();
                    break;
                case 2:
                    await joinSwarm();
                    break;
                case 3:
                    await stackDeploy();
                    break;
                case 4:
                    latestAppVersion += 1;
                    await updateService();
                    break;
                case 5:
                    await checkRollbackStatus(id, version);
                    break;
            }
        } catch (e) {
            console.log('ERROR', e);
        }
    }
};

main();
