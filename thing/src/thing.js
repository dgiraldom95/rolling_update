const express = require('express');
const axios = require('axios');
const process = require('process');

const app = express();
const port = 3004;

const appHost = 'http://iot_app';

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

const sendData = async () => {
    try {
        const temperature = Math.random() * 20 + 10;
        const r = await axios.post(`${appHost}:3000/reports`, { temperature });
        console.log('R: ', r);
    } catch (err) {
        console.log(err);
    }
};

setInterval(sendData, 100);
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
