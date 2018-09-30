#!/usr/bin/env node

// test server, not for production use
// run pm2 start mudgateway-client --watch
// client will then be at http://foo/static/client.html

const express = require('express')
const app = express()

app.get('/', (req, res) => res.send('Hello World!'))
app.use('/static', express.static('static'));

app.listen(9000, () => console.log('Running mud client'))
