const http = require('http');

const socketPath = '/var/run/docker.sock';
const config = {
    replicas: 5,
    updateDelay: '20s',
};

const dockerRequest = async (path, method, body) => {
    const options = {
        socketPath,
        path,
        method,
    };

    return new Promise((resolve, reject) => {
        const request = http.request(options, res => {
            res.setEncoding('utf8');
            res.on('error', data => reject(data));
            res.on('data', data => resolve(JSON.parse(data)));
        });
        if (body) {
            request.write(JSON.stringify(body));
        }
        request.end();
    });
};

const joinSwarm = async () => {
    let r = await dockerRequest('/swarm/leave?force=true', 'POST');
    console.log('LEAVE SWARM: ', r);
    r = await dockerRequest('/swarm/init', 'POST', { ListenAddr: '0.0.0.0:2377' });
    console.log('JOIN SWARM: ', r);
};

const createService = async () => {
    let r = await dockerRequest('/services/create', 'POST', {
        Name: 'app',
        TaskTemplate: {
            ContainerSpec: {
                Image: 'dgiraldom/node-test-1:working',
            },
            Mode: {
                Replicated: {
                    Replicas: config.replicas,
                },
            },
            UpdateConfig: {
                Delay: config.updateDelay,
            },
        },
    });
    console.log('CREATE SERVICE: ', r);
    r = await dockerRequest('/services', 'GET');
    console.log('SERVICES: ', JSON.stringify(r));
};

const main = async () => {
    try {
        await joinSwarm();
        await createService();
    } catch (e) {
        console.log('ERROR', e);
    }
};

main();
