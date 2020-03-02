const http = require('http');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const socketPath = '/var/run/docker.sock';
const config = {
    replicas: 5,
    updateDelay: '20s',
};
const appContainerName = 'iot_app';
const monitorContainerName = 'iot_monitor';
const mongoContainerName = 'iot_mongo';

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
    console.log('SERVICES: ', JSON.stringify(services));
    const appServiceId = services.find(s => s.Spec.Name === appContainerName).ID;
    const appService = await dockerRequest(`/services/${appServiceId}`, 'GET');
    const version = appService.Version.Index;
    return { id: appServiceId, version };
};

const createAppService = async () => {
    let r = await dockerRequest('/services/create', 'POST', {
        Name: appContainerName,
        TaskTemplate: {
            ContainerSpec: {
                Image: 'dgiraldom/node-test-1:working',
            },
        },
        Mode: {
            Replicated: {
                Replicas: 5,
            },
        },
        UpdateConfig: {
            Delay: 1000000,
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
    console.log('CREATE APP SERVICE: ', r);
};

const createMonitorService = async () => {
    let r = await dockerRequest('/services/create', 'POST', {
        Name: monitorContainerName,
        TaskTemplate: {
            ContainerSpec: {
                Image: 'dgiraldom/monitor',
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
                    PublishedPort: 3001,
                    TargetPort: 3001,
                },
            ],
        },
        Networks: [{ Target: 'iot_overlay' }],
    });
    console.log('CREATE MONITOR SERVICE: ', r);
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
    let r = await dockerRequest(`/services/${id}/update?version=${version}`, 'POST', {
        Name: appContainerName,
        TaskTemplate: {
            ContainerSpec: {
                Image: 'dgiraldom/node-test-1:failing',
            },
        },
        Mode: {
            Replicated: {
                Replicas: 5,
            },
        },
        UpdateConfig: {
            Delay: 1000000,
        },
        Networks: [{ Target: 'iot_overlay' }],
    });
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
};

const rollback = async (id, version) => {
    let r = await dockerRequest(`/services/${id}/update?version=${version}&rollback=previous`, 'POST', {
        Name: appContainerName,
        TaskTemplate: {
            ContainerSpec: {
                Image: 'dgiraldom/node-test-1:failing',
            },
        },
        Mode: {
            Replicated: {
                Replicas: 5,
            },
        },
        UpdateConfig: {
            Delay: 1000000,
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
    console.log('SERVICE ROLLBACK: ', r);
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
            switch (op) {
                case 1:
                    await leaveSwarm();
                    break;
                case 2:
                    await joinSwarm();
                    break;
                case 3:
                    await stackDeploy();
                    break;
                case 4:
                    let { id, version } = await getAppServiceInfo();
                    await updateService(id, version);
                    break;
                case 5:
                    ({ id, version } = await getAppServiceInfo());
                    await rollback(id, version);
                    break;
            }
        } catch (e) {
            console.log('ERROR', e);
        }
    }
};

main();
