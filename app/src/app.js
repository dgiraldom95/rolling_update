const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
const port = 3000;

const APP_VERSION = 1;

const middleware = async (req, res, callback) => {
    const report = {};
    const iTime = new Date();

    callback(req, res);

    const latency = new Date() - iTime;

    report.status = res.status !== 500 ? 'ok' : 'error';
    report.latency = latency;
    report.version = APP_VERSION;
    const response = await axios.post('http://monitor:3001/reports', report);
    console.log('report: ', response.data);
};

app.get('/', async (req, res) => {
    await middleware(req, res, (reqP, resP) => resP.send('app'));
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
