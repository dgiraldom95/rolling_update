const express = require('express')
const app = express()
const port = 3000

app.get('/', (req, res) => res.send('Hello World!'))

app.get('/healthcheck', (req, res) => {
    console.log('check')
    res.status(500).send('check')
})
app.listen(port, () => console.log(`Example app listening on port ${port}!`))