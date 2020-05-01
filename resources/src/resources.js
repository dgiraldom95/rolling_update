const express = require('express');
const exec = require('child_process').exec;
const axios = require('axios');
const process = require('process');

const app = express();
const port = 3002;
const monitorHost = process.env.MONITOR_HOST || 'iot_monitor';

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

function execute(command, callback) {
    exec(command, function (error, stdout, stderr) {
        if (stderr) {
            console.log('COMMAND ERR: ', stderr);
        }
        callback(stdout);
    });
}

const reportResources = async () => {
    console.log('Reporting');

    const getResources = async () => {
        return new Promise((resolve, reject) => {
            execute(
                `docker stats --no-stream --format "{{.Name}},{{.Container}},{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}\n"`,
                (out) => {
                    const data = out.split('\n');
                    const regex = '[0-9.]+';
                    const report = data
                        .filter((d) => d.length > 0)
                        .map((d) => {
                            const fields = d.split(',');

                            return {
                                name: fields[0],
                                container: fields[1],
                                cpu: Number.parseFloat(fields[2].replace('%', '')),
                                ram: Number.parseFloat(fields[3].split('/')[0].match(regex)),
                                netIO: Number.parseFloat(fields[4].split('/')[0].match(regex)),
                                time: new Date(),
                            };
                        });

                    resolve(report);
                },
            );
        });
    };

    const getImages = async () => {
        return new Promise((resolve, reject) => {
            execute(`docker container ls --format='{{.ID}}, {{.Image}}\n'`, (out) => {
                const data = out.split('\n');
                const report = data
                    .filter((d) => d.length > 0)
                    .map((d) => {
                        const fields = d.split(',');
                        return { container: fields[0], image: fields[1] };
                    });
                resolve(report);
            });
        });
    };
    let [resources, images] = await Promise.all([getResources(), getImages()]);

    resources = resources.map((r) => {
        const image = images.find((i) => i.container === r.container).image;
        const version = image.split(':')[1];
        return { ...r, image, version };
    });

    console.log(monitorHost);

    try {
        const monitorResponse = await axios.post(`http://${monitorHost}:3001/resources`, resources);
    } catch (err) {
        console.log(err.message);
    }
};

setInterval(reportResources, 10000);
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
