const Knex = require("knex")

const notesService = {
    getAllNotes(knex) {
        return knex.select('*').from('notes')
    },

    insertNote(knex, newNote) {
        return knex
            .insert(newNote)
            .into('notes')
            .returning('*')
            .then(rows => {
                return rows[0]
            })
    }
}