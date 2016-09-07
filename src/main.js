import $ from 'jquery'
import jquery from 'jquery'
import _ from 'lodash'
import Model from './lib/models/model.js'
import Applicator from './lib/controllers/applicator.js'
import Annotator from './lib/controllers/annotator.js'
import History from './lib/models/history'
window.$ = $
window.jQuery = jquery
window.jquery = jquery
window._ = _
import 'typeahead.js'

class Plokamos {

    constructor (element) {
        var self = this
        this.anchor = $(element)
        this.model = new Model(self);
        // keep this dynamically loaded for now
        this.getEndpoint = () => {return { query: self.anchor.data('sparql-endpoint'),read: self.anchor.data('sparql-select-endpoint'), write: self.anchor.data('sparql-update-endpoint')}}
        this.getUrn = () => self.anchor.data('urn')
        this.getUser = () => self.anchor.data('user')

        this.initialize = () => {

            self.model
                .load(self.getEndpoint(), self.getUrn(), self.getUser())
                .then((success) => self.applicator = new Applicator(self))
                .then((success) => self.history = new History(self))
                .then((success) => self.annotator = new Annotator(self))
        }

    }
}

window.Plokamos = Plokamos