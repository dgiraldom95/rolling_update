const express = require('express');
const exec = require('child_process').exec;
const axios = require('axios');

const app = express();
const port = 3002;

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

function execute(command, callback) {
    exec(command, function(error, stdout, stderr) {
        if (stderr) {
            console.log('COMMAND ERR: ', stderr);
        }
        callback(stdout);
    });
}

const reportResources = () => {
    console.log('Reporting');
    execute(
        `docker stats --no-stream --format "{{.Name}},{{.Container}},{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}\n"`,
        async out => {
            data = out.split('\n');
            const regex = '[0-9.]+';
            const report = data
                .filter(d => d.length > 0)
                .map(d => {
                    fields = d.split(',');

                    return {
                        name: fields[0],
                        container: fields[1],
                        cpu: Number.parseFloat(fields[2].replace('%', '')),
                        ram: Number.parseFloat(fields[3].split('/')[0].match(regex)),
                        netIO: Number.parseFloat(fields[4].split('/')[0].match(regex)),
                    };
                });
            try {
                const monitorResponse = await axios.post('http://iot_monitor:3001/resources', report);
                console.log('Monitor: ', monitorResponse.body);
            } catch (err) {
                console.log(err.response);
            }
        },
    );
};

setInterval(reportResources, 10000);
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
