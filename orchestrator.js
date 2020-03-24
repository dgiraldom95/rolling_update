const http = require('http');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const socketPath = '/var/run/docker.sock';

const appContainerName = 'iot_app';
const monitorContainerName = 'iot_monitor';
const resourceContainerName = 'iot_resources';
const mongoContainerName = 'iot_mongo';

let latestAppVersion = 2;
const updateInterval = 1000000000000000000;

const exec = async command => {
    return new Promise((resolve, reject) => {
        exec(command, function(error, stdout, stderr) {
            if (stderr) {
                console.log('COMMAND ERR: ', stderr);
                reject(stderr);
            }
            resolve(stdout);
        });
    });
};

const dockerRequest = async (path, method, body) => {
    const options = {
        socketPath,
        path,
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
    };

    return new Promise((resolve, reject) => {
        const request = http.request(options, res => {
            res.setEncoding('utf8');
            res.on('error', data => reject(data));
            res.on('data', data => {
                console.log(data);
                resolve(JSON.parse(data));
            });
        });

        if (body) {
            request.write(JSON.stringify(body));
        }
        request.end();
    });
};

const getAppContainerSpec = image => ({
    Name: appContainerName,
    TaskTemplate: {
        ContainerSpec: {
            Image: image,
        },
    },
    Mode: {
        Replicated: {
            Replicas: 5,
        },
    },
    UpdateConfig: {
        Parallelism: 1,
        Delay: 100,
        FailureAction: 'pause',
        Monitor: 15000000000,
        MaxFailureRatio: 0.15,
    },
    RollbackConfig: {
        Parallelism: 1,
        Delay: updateInterval,
    },
    EndpointSpec: {
        Ports: [
            {
                Protocol: 'tcp',
                PublishedPort: 3000,
                TargetPort: 3000,
            },
        ],
    },
    Networks: [{ Target: 'iot_overlay' }],
});

const leaveSwarm = async () => {
    let r = await dockerRequest('/swarm/leave?force=true', 'POST');
    console.log('LEAVE SWARM: ', r);
};

const joinSwarm = async () => {
    let r = await dockerRequest('/swarm/init', 'POST', { ListenAddr: '0.0.0.0:2377' });
    console.log('JOIN SWARM: ', r);
};

const getAppServiceInfo = async () => {
    const services = await dockerRequest('/services', 'GET');
    const appServiceId = services.find(s => s.Spec.Name === appContainerName).ID;
    const appService = await dockerRequest(`/services/${appServiceId}`, 'GET');
    const version = appService.Version.Index;

    return { id: appServiceId, version };
};

const createAppService = async () => {
    let r = await dockerRequest('/services/create', 'POST', getAppContainerSpec('dgiraldom/node-test-1:working'));
    console.log('CREATE APP SERVICE: ', r);
};

const createResourceReportingService = async () => {
    await exec(`docker service create \
    --mode global \
    --mount type=bind,source=/var/run/docker.sock,destination=/var/run/docker.sock \
    --network iot_overlay dgiraldom/resources`);
    //     let r = await dockerRequest('/services/create', 'POST', {
    //         Name: resourceContainerName,
    //         TaskTemplate: {
    //             ContainerSpec: {
    //                 Image: 'dgiraldom/resources',
    //             },
    //             Mounts: [
    //                 {
    //                     Source: '/var/run/docker.sock',
    //                     Target: '/var/run/docker.sock',
    //                     Type: 'bind',
    //                 },
    //             ],
    //         },
    //         // Mode: 'global',
    //         Mode: {
    //             Replicated: {
    //                 Replicas: 1,
    //             },
    //         },
    //         EndpointSpec: {
    //             Ports: [
    //                 {
    //                     Protocol: 'tcp',
    //                     PublishedPort: 3002,
    //                     TargetPort: 3002,
    //                 },
    //             ],
    //         },
    //         Networks: [{ Target: 'iot_overlay' }],
    //     });
    //     console.log('CREATE RESOURCE SERVICE: ', r);
    // };

    // const createMonitorService = async () => {
    //     let r = await dockerRequest('/services/create', 'POST', {
    //         Name: monitorContainerName,
    //         TaskTemplate: {
    //             ContainerSpec: {
    //                 Image: 'dgiraldom/monitor',
    //             },
    //         },
    //         Mode: {
    //             Replicated: {
    //                 Replicas: 1,
    //             },
    //         },
    //         EndpointSpec: {
    //             Ports: [
    //                 {
    //                     Protocol: 'tcp',
    //                     PublishedPort: 3001,
    //                     TargetPort: 3001,
    //                 },
    //             ],
    //         },
    //         Networks: [{ Target: 'iot_overlay' }],
    //     });
    //     console.log('CREATE MONITOR SERVICE: ', r);
};

const createMongoService = async () => {
    let r = await dockerRequest('/services/create', 'POST', {
        Name: mongoContainerName,
        TaskTemplate: {
            ContainerSpec: {
                Image: 'mvertes/alpine-mongo',
            },
        },
        Mode: {
            Replicated: {
                Replicas: 1,
            },
        },
        EndpointSpec: {
            Ports: [
                {
                    Protocol: 'tcp',
                    PublishedPort: 27017,
                    TargetPort: 27017,
                },
            ],
        },
        Networks: [{ Target: 'iot_overlay' }],
    });
    console.log('CREATE DB SERVICE: ', r);
};

const updateService = async (id, version) => {
    let r = await dockerRequest(
        `/services/${id}/update?version=${version}`,
        'POST',
        getAppContainerSpec('dgiraldom/node-test-1:failing'),
    );
    console.log('SERVICE UPDATE: ', r);
};

const createOverlayNetwork = async () => {
    let r = await dockerRequest('/networks/create', 'POST', {
        Name: 'iot_overlay',
        CheckDuplicate: true,
        Driver: 'overlay',
    });
    console.log('OVERLAY NETWORK: ', r);
};

const stackDeploy = async () => {
    console.log('CREATING STACK');
    await createOverlayNetwork();
    await createAppService();
    await createMonitorService();
    await createMongoService();
    await createResourceReportingService();
};

const sendRollbackRequest = async (id, version) => {
    let r = await dockerRequest(
        `/services/${id}/update?version=${version}&rollback=previous`,
        'POST',
        getAppContainerSpec('dgiraldom/node-test-1:working'),
    );
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
                    ({ id, version } = await getAppServiceInfo());
                    latestAppVersion += 1;
                    await updateService(id, version);
                    break;
                case 5:
                    ({ id, version } = await getAppServiceInfo());
                    await checkRollbackStatus(id, version);
                    break;
            }
        } catch (e) {
            console.log('ERROR', e);
        }
    }
};

main();
