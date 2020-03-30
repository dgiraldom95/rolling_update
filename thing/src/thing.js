const express = require('express');
const axios = require('axios');

const app = express();
const port = 3004;

const appHost = process.env.APP_HOST;

app.get('/healthcheck', (req, res) => {
    res.status(200).end();
});

const sendData = async () => {
    try {
        const edgeResponse = await axios.get(`http://${appHost}:3000`);
    } catch (err) {
        console.log(err.response);
    }
};

setInterval(sendData, 500);
app.listen(port, () => console.log(`Example app listening on port ${port}!`));
