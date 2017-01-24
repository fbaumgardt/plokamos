import Utils from '../../utils'
import SPARQL from '../sparql'
import sparqlQuery from '../io/sparqlRetriever'
import _ from 'lodash'

const simplify = Symbol()
const expand = Symbol()

var pmetaMap = {
    "http://data.perseids.org/meta#Graph" : "g",
    "http://data.perseids.org/meta#Subject" : "s",
    "http://data.perseids.org/meta#Predicate" : "p",
    "http://data.perseids.org/meta#Object" : "o"
}

// todo: do we need to check for id? if so, we can check for it anywhere, e.g. reduce (values == id) with OR
// simplification applies the rules and creates a function that performs the simplification
var simplification = (rules) =>
    // v is annotation body
    // id is annotation id
    (v,id) =>
        _.reduce(
            rules,
            (result, rule) => {
                 var found = _.find(v, (o) =>
                     (o[pmetaMap[rule.constraint]].value || o[pmetaMap[rule.constraint]]) === rule.value
                    )
                result[pmetaMap[rule.target]] = found[pmetaMap[rule.source]].value
                return result
            },
            {}
        )

// expansion applies the rules and creates a function that performs the expansion
var expansion = (rules) => (gspo, graphs) => {

    // if exisiting annotation, get bindings by filtering for rule-conforming triples
    let annotation = (graphs||{})[gspo.g]
    let bindings = annotation ? annotation.filter(
        (quad) => _.reduce(rules, (result, rule) => result || (quad[pmetaMap[rule.constraint]].value === rule.value && quad[pmetaMap[rule.source]].value === gspo[pmetaMap[rule.target]]), false)
    ) : []

    // what does it mean to have annotation and mismatching length? --> update. valid case or not?
    // todo: replace bond with rule-derived token
    let id = (bindings.length%rules.length || !annotation) ? gspo.g + "-bond-" + Utils.hash(JSON.stringify(gspo)).slice(0, 4) : undefined

    // if new annotation, get bindings by creating them with rule
    // creates an array with an object (one triple) for every rule in the bundle
    return id ? rules.map((rule) => {
        // avoid figuring out where to place id by overwriting it below
        // this maps a rule structure like:
        // {
        //   constraint:"<http://data.perseids.org/meta#Predicate|http://data.perseids.org/meta#Subject|http://data.perseids.org/meta#Object>"
        //   value: "<uri>"
        //   target:"<http://data.perseids.org/meta#Predicate|http://data.perseids.org/meta#Subject|http://data.perseids.org/meta#Object>"
        //   source:"<http://data.perseids.org/meta#Predicate|http://data.perseids.org/meta#Subject|http://data.perseids.org/meta#Object>"
        // }
        // to a resource like this
        //  {
        //    g:"<annotation_graph>"
        //    s:"<uri_from_annotation>|<rule_value>"
        //    p:"<uri_from_annotation>|<rule_value>"
        //    o:"<uri_from_annotation>|<rule_value>"
        //  }
        //
        // whichever the rule constraint applies to (s|o|p) will be replaced with the corresponding rule value
        // whichever the rule source applies to (s|o|p) will be replaced with the value of the rule target (s|o|p) from the annotation graph
        // leaving the remaining element (s|o|p) filled with the uri from the annotation
        let res = {g:gspo.g, s:id, p:id, o:id} 
        res[pmetaMap[rule.constraint]] = rule.value
        res[pmetaMap[rule.source]] = gspo[pmetaMap[rule.target]]
        return SPARQL.gspoToBinding(res)
        }) : bindings

}

class Transformation {

    // rulesList contains bundles of rules
    // a target ,source, constraint == a rule
    constructor(rulesList) {
        this[simplify] = rulesList.map((rules) => simplification(rules))
        this[expand] = rulesList.map((rules) => expansion(rules))
    }

    // todo: grouped is expected to be a dictionary of annotations
    simplify(body,id) {
        // todo: fix mapping - possibly decide which rule to use
        // grouped has graph uris as keys and bindings as values
        // need to determine which rules to use
        return body ? this[simplify].map((s) => s(body,id)) : this[simplify]
    }

    expand(gspo, graphs) {
        // grouped has graph uris as keys and bindings as values
        // need to determine which rules to use
        return gspo ? this[expand].map((e) => e(gspo,graphs)) : this[expand]
    }

    static get(uri) {
        let query = `
            prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            prefix pmeta: <http://data.perseids.org/meta#>
            
            SELECT DISTINCT ?transformation ?target ?constraint ?value ?source WHERE {
              GRAPH <http://data.perseids.org/namespaces> {
                BIND(<${uri}> AS ?uri)
                ?uri rdf:type pmeta:namespace .
                ?uri pmeta:hasTransformation ?transformation.
                ?transformation pmeta:hasTarget ?t .
                ?t rdf:type ?target .
                ?t pmeta:hasConstraint ?c .
                ?c rdf:type ?constraint .
                ?c pmeta:hasURI ?value .
                ?t pmeta:hasSource ?source 
              }
            }
        `
        return {
            from: (endpoint) => {
                return sparqlQuery(endpoint, query)
                    .then((data) => {
                        let transformations = _.chain(data.results.bindings)
                            .map(SPARQL.bindingToGspo)
                            .groupBy('transformation')
                            .values()
                            .value()

                        return new Transformation(transformations)
                    })
            }
        }

    }

}

export default Transformation
