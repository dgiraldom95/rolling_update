const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
const port = 3000;

const APP_VERSION = process.env.APP_VERSION;

const cloudUrl = 'http://157.230.14.37';

const middleware = async (req, res, callback) => {
    const report = {};
    const iTime = new Date();

    callback(req, res);
    const latency = new Date() - iTime;

    report.status = res.statusCode !== 500 ? 'ok' : 'error';
    report.latency = latency;
    report.version = APP_VERSION;
    report.date = new Date();
    try {
        const response = await axios.post('http://iot_monitor:3001/reports', report);
        res.send(response.data);
    } catch {
        res.status(200).end();
    }
};

const fib = (n) => {
    if (n === 1 || n === 0) {
        return 1;
    } else {
        return fib(n - 1) + fib(n - 2);
    }
};

let temperatureArray = [];
app.post('/reports', async (req, res) => {
    await middleware(req, res, async () => {
        const { temperature } = req.body;
        temperatureArray.push(temperature);
        if (temperatureArray.length >= 10) {
            const count = temperatureArray.length;

            const avg = temperatureArray.reduce((sum, curr) => (sum += curr), 0) / count;
            console.log('AVG: ', avg);
            temperatureArray = [];

            await axios.post(`${cloudUrl}/temperature`, { count, avg });
        }

        const rand = Math.random();
        const randFailThreshold = APP_VERSION < 2 ? 0.95 : 0.8;

        const result = fib(20 * APP_VERSION);

        if (rand > randFailThreshold) {
            res.status(500).end();
        } else {
            res.status(200).end();
        }
    });
});

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
