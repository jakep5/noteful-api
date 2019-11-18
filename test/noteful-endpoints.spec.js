const { expect } = require('chai')
const knex = require('knex')
const app = require('../src/app')
const { makeNotesArray } = require('./notes.fixtures')
const { makeMaliciousNote } = require('./notes.fixtures')
const { makeFoldersArray } = require('./folders.fixtures')

describe('Notes endpoint', function() {
    const testFolders = makeFoldersArray();

    let db

    before('make knex instance', () => {
        db = knex({
            client: 'pg',
            connection: process.env.TEST_DATABASE_URL
        })
        app.set('db', db)
    })

    after('disconnect from db', () => db.raw('TRUNCATE folders, notes RESTART IDENTITY CASCADE'))

    before('clean the table', () => db.raw('TRUNCATE folders, notes RESTART IDENTITY CASCADE'))

    before('insert folders', () => {
        return db
            .into('folders')
            .insert(testFolders)
    })

    afterEach('cleanup', () => db('notes').truncate())

    describe(`GET /api/notes`, () => {
        context(`Given no notes`, () => {
            it(`responds with 200 and an empty list`, () => {
                return supertest(app)
                    .get('/api/notes')
                    .expect(200, [])
            })
        })
        context('Given there are notes in the database', () => {
            const testNotes = makeNotesArray();
            const testFolders = makeFoldersArray();

            beforeEach('insert notes', () => {
                return db
                    .into('notes')
                    .insert(testNotes)
            })

            it('GET api/notes responds with 200 and all notes are returned', () => {
                return supertest(app)
                    .get('/api/notes')
                    .expect(200, testNotes)
            })
        })

        context(`Given an XSS attack note`, () => {
            const testNotes = makeNotesArray();
            const testFolders = makeFoldersArray();
            const { maliciousNote, expectedNote } = makeMaliciousNote();

            beforeEach('insert malicious note', () => {
                return db
                    .into('notes')
                    .insert([ maliciousNote ])
                })
            })

            it('removes XSS attack content', () => {
                return supertest(app)
                    .get(`/api/notes`)
                    .expect(200)
                    .expect(res => {
                        expect(res.body[0].name).to.eql(expectedNote.name)
                        expect(res.body[0].content).to.eql(expectedNote.content)
                    })
            })
        })

    describe(`GET /api/notes/:note_id`, () => {
        context('Given there are no notes in the database', () => {
            const testNotes = makeNotesArray();
            const testFolders = makeFoldersArray();

            beforeEach('insert notes', () => {
                return db
                    .into('notes')
                    .insert(testNotes)
            })

            it('GET /notes/:note_id responds with 200 and the specified note', () => {
                const noteId = 3;
                const expectedNote = testNotes[noteId - 1]
                return supertest(app)
                    .get(`/api/notes/${noteId}`)
                    .expect(200, expectedNote)
            })
        })

        context(`Given no notes`, () => {
            it(`responds with 404`, () => {
                const noteId = 112233;
                return supertest(app)
                    .get(`/api/notes/${noteId}`)
                    .expect(404, { error: { message: `Note doesn't exist` }})
            })
        })

        context(`Given an XSS note attack`, () => {
            const testNotes = makeNotesArray();
            const testFolders = makeFoldersArray();
            const maliciousNote = {
                id: 911,
                name: 'Naughty naughty very naughty <script>alert("xss");</script>',
                modified: new Date(),
                folder_id: 2,
                content: `Bad image <img src="https://url.to.file.which/does-not.exist" onerror="alert(document.cookie);">. But not <strong>all</strong> bad.`,
            };

            beforeEach('insert malicious note', () => {
                return db
                    .into('notes')
                    .insert([ maliciousNote ])
                })
            })

            it('removes XSS attack content', () => {
                return supertest(app)
                    .get(`/api/notes/911`)
                    .expect(200)
                    .expect(res => {
                        expect(res.body.name).to.eql('Naughty naughty very naughty &lt;script&gt;alert(\"xss\");&lt;/script&gt;')
                        expect(res.body.content).to.eql(`Bad image <img src="https://url.to.file.which/does-not.exist">. But not <strong>all</strong> bad.`)
                    })
            })
        })
    
        describe(`POST /api/notes`, () => {
            const testNotes = makeNotesArray();
            beforeEach('insert notes', () => {
                return db
                    .into('notes')
                    .insert(testNotes)
            })

            it(`creates a note, responding with 201 and the new note`, function() {
                this.retries(3)
                const newNote = {
                    name: 'Test new note',
                    folder_id: 2,
                    modified: "now",
                    content: 'Test content'
                }
                return supertest(app)
                    .post('/api/notes')
                    .send(newNote)
                    .expect(201)
                    .expect(res => {
                        expect(res.body.name).to.eql(newNote.name)
                        expect(res.body.folder_id).to.eql(newNote.folder_id)
                        expect(res.body.content).to.eql(newNote.content)
                        expect(res.body).to.have.property('id')
                    })
                    .then(postRes => 
                        supertest(app)
                            .get(`/api/notes/${postRes.body.id}`)
                            .expect(postRes.body)
                    )
            })

            const requiredFields = ['name', 'content', 'folder_id']

            requiredFields.forEach(field => {
                const newNote = {
                    name: 'test new note',
                    content: 'test content',
                    folder_id: 3
                }

                it(`responds with 400 and an error message when the '${field} is missing`, () => {
                    delete newNote[field]

                    return supertest(app)
                        .post('api/notes')
                        .send(newNote)
                        .expect(400, {
                            error: {message: `Missing '${field} in request body`}
                        })
                })
            })

            it('removes XSS attack content from response', () => {
                const { maliciousNote, expectedNote } = makeMaliciousNote();

                return supertest(app)
                    .post(`/api/notes`)
                    .send(maliciousNote)
                    .expect(201)
                    .expect(res => {
                        expect(res.body.name).to.eql(expectedNote.name)
                        expect(res.body.content).to.eql(expectedNote.content)
                    })
            })
        })

        describe(`DELETE /api/notes/:note_id`, () => {
            context('Given there are notes in the database', () => {
                const testNotes = makeNotesArray();

                beforeEach('insert notes', () => {
                    return db
                        .into('notes')
                        .insert(testNotes)
                })

                it('responds with 204 and removes the article', () => {
                    const idToRemove = 2;
                    const expectedNotes = testNotes.filter(note => note.id !== idToRemove)

                    return supertest(app)
                        .delete(`/api/notes/${idToRemove}`)
                        .expect(204)
                        .then(res =>
                            supertest(app)
                                .get(`/api/notes`)
                                .expect(expectedNotes)
                        )
                })
            })

            context(`Given no notes`, () => {
                it(`responds with 404`, () => {
                    const noteId = 112233;
                    return supertest(app)
                        .delete(`/api/notes/${noteId}`)
                        .expect(404, { error: {message: `Note doesn't exist`} })
                })
            })
        })

        describe.only(`PATCH /api/notes/:note_id`, () => {
            context(`Given no notes`, () => {
                it(`responds with 404`, () => {
                    const noteId = 112233
                    return supertest(app)
                        .patch(`/api/notes/${noteId}`)
                        .expect(404, { error: { message: `Note does not exist` } })
                })
            })

            context('Given there are notes in the database', () => {
                const testNotes = makeNotesArray();

                beforeEach('insert notes', () => {
                    return db
                        .into('notes')
                        .insert(testNotes)
                        .then(() => {
                            return db
                                .into('notes')
                                .insert(testNotes)
                        })
                })

                it('reponds with 204 and updates the note', () => {
                    const idToUpdate = 2;
                    const updatedNote = {
                        name: 'Updated Name',
                        content: 'Updated content',
                        folder_id: 1
                    }
                    const expectedNote = {
                        ...testNotes[idToUpdate - 1],
                        ...updatedNote
                    }
                    return supertest(app)
                        .patch(`/api/notes/${idToUpdate}`)
                        .send(updatedNote)
                        .expect(204)
                        .then(res =>
                            supertest(app)
                                .get(`/api/notes/${idToUpdate}`)
                                .expect(expectedNote)
                        )
                })

                it(`responds with 400 when no required fields supplied`, () => {
                    const idToUpdate = 2
                    const updatedNote = {
                        name: 'test update'
                    }
                    const expectedNote = {
                        ...testNotes[idToUpdate - 1],
                        ...updatedNote
                    }

                    return supertest(app)
                        .patch(`/api/notes/${idToUpdate}`)
                        .send({
                            ...updatedNote,
                            fieldToIgnore:'should not be in GET response'
                        })
                        .expect(204)
                        .then(res =>
                            supertest(app)
                                .get(`/api/notes.${idToUpdate}`)
                                .expect(expectedNote)
                        )
                })
            })
        })
})