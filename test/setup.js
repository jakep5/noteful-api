const { expect } = require('chai')
const supertest = require('supertest')
require('dotenv').config();
process.env.TZ = 'UTC'

global.expect = expect
global.supertest = supertest