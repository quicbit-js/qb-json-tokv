# qb-json-tokv

[![npm][npm-image]][npm-url]
[![downloads][downloads-image]][npm-url]
[![bitHound Dependencies][proddep-image]][proddep-link]
[![dev dependencies][devdep-image]][devdep-link]
[![code analysis][code-image]][code-link]

[npm-image]:       https://img.shields.io/npm/v/qb-json-tokv.svg
[downloads-image]: https://img.shields.io/npm/dm/qb-json-tokv.svg
[npm-url]:         https://npmjs.org/package/qb-json-tokv
[proddep-image]:   https://www.bithound.io/github/quicbit-js/qb-json-tokv/badges/dependencies.svg
[proddep-link]:    https://www.bithound.io/github/quicbit-js/qb-json-tokv/master/dependencies/npm
[devdep-image]:    https://www.bithound.io/github/quicbit-js/qb-json-tokv/badges/devDependencies.svg
[devdep-link]:     https://www.bithound.io/github/quicbit-js/qb-json-tokv/master/dependencies/npm
[code-image]:      https://www.bithound.io/github/quicbit-js/qb-json-tokv/badges/code.svg
[code-link]:       https://www.bithound.io/github/quicbit-js/qb-json-tokv

Fast (~150 MB/sec) and light-weight, incremental, validating, JSON parser with zero dependencies.

**qb-json-tokv introduces validation and incremental parsing!**

qb-json-tokv started out as an update to qb-json-tok (faster but with no validation), but winded up making more
sense as a new package once done.  Very fast JSON parsing under a complete validating parse-graph.

**Complies with the 100% test coverage and minimum dependency requirements** of 
[qb-standard](http://github.com/quicbit-js/qb-standard) . 


## Install

    npm install qb-json-tokv

# API

## tokenize (callback, src, off, lim, opt)
  
Tokenize the given source array or buffer, sending all results to the given callback function. (the
process can be controlled/stopped via the function return value)

    src        A UTF-8 encoded array containing ANY JSON value such as an object, quoted
               string, array, or valid JSON number.  IOW, it doesn't have to be a {...} object.
               
    callback   A function called for each token encountered.
    
        src         the buffer being parsed
        koff        index of key start (inclusive) in current object, in arrays koff is -1
        klim        index of key limit (non-inclusive) in current object, in arrays koff is -1
        tok         integer token representing the type encountered.  In most cases, token is the ASCII of the 
                    first character encountered.  'n' for null, 't' for true, '{' for object start.
                    The TOK property defines these token codes by name:
                        
                    var TOK = {
                      ARR_BEG: 91,    // '['
                      ARR_END: 93,    // ']'
                      OBJ_BEG: 123,   // '{'
                      OBJ_END: 125,   // '}'
                      FAL: 102,       // 'f'
                      NUL: 110,       // 'n'
                      NUM: 78,        // 'N'
                      STR: 34,        // '"'
                      TRU: 116,       // 't'
                      ERR: 0,         // error.  check err_info for information
                      BEG: 66,        // 'B' - begin - about to process
                      END: 69,        // 'E' - end -   buffer limit reached
                    }
                        
                        
        voff        index of value offset (inclusive) in current object or array
        vlim        index of value limit (non-inclusive) in current object or array
        
        info        (object) if tok === TOK.ERR or tok === TOK.END, then info holds details that can be 
                    used to recover or handle values split across buffers.
                     
        return      the value returned controls processing:
                        returning 0 halts the tokenizer.
                        returning a positive number will continue tokenizing at that offset (it is not possible to return to 0)
                                (backtrack or skip forward).  Note that
                                jumping to the value 'xyz' of a key value pair:
                                        { "a": "xyz" }...
                                will make the tokenizer return just a string value
                                
                        returning anything else (undefined, null, negative number) - will cause 
                                processing to continue.
                     
    opt             
        state       (integer - to continue parsing at another point, you can provide a state
    for incremental parsing, you can pass the state object returned by the end callback into this argument.

## TOK

Tokens passed to the callback by name (see the token callback parameter, above, for the list)

### Special tokens BEG(IN), END, ERR(OR)

When tokenizer begins or ends processing of a source buffer, it sends BEG and END tokens along with information
in the 'info' parameter.  When a value terminates unexpectedly, an ERR token is sent 
statement, error and end cases will fall into the default case instead of being forgotten and unchecked.

    function callback (src, koff, klim, tok, voff, vlim, info) {
        switch (tok) {
            case TOK.OBJ:
                ...
            case TOK.NUM:
                ...
            case TOK.BEG:
                ...
            case TOK.END:
                ...
            default:
                error('case not handled')       // we didn't have to remember to handle TOK.ERR - it fell into the default case
        }
    }

### info
    
When tok is set to TOK.ERR or TOK.END, then the 'info' parameter will hold more
information about the parse state.  In conjuction with the return-control to 
reset parsing position, info allows you to define recovery strategies for error cases and parsing 
values split across buffers.

fields:

    info
    {
      msg:    (string) brief summar such as 'unexpected character' or 'unterminated string'
      state:  (int) a code that defines the parse state and position.
              see state_to_str(state) and state_to_obj(state) as well as the section on
              "How It Works" below to
              understand exactly how to use this code.
      tok:    the token that was last processed before the end or error occured
    }

## state_to_str (state)

Convert a state integer to a human-readable string:

    var qbtok = require('qb-json-tokv')
    qbtok(13568)
    > 'in object, before first key'
    
## state_to_obj (state) 

Convert a state integer to an object with accessors.  NOTE that the accessors are functions, not iterable properties.

    var qbtok = require('qb-json-tokv')
    qbtok(13568)
    > { ctx: 'obj', pos: 'before', first: true, key: true }
    

## Adding Custom Rules to Parsing

Though qb-json-tokv uses bit manipulation, we have tried to make the rules as readable as possible so even if
you aren't comfortable with bit twiddling, you may understand and modify the parse rules.  Can you see how
to make parsing tolerant of trailing commas by looking at the states below? (the answer is at the bottom of this section).
    
    // create an int-int map from (state + tok) -- to --> (new state)
    function state_map () {
      var ret = []
    
      // map ( state0, tokens, state1)
      var map = function (s0, chars, s1) {
        for (var i=0; i<chars.length; i++) {
          ret[s0 | chars.charCodeAt(i)] = s1
        }
      }
    
      var val = '"ntf-0123456789' // all legal value start characters
    
      // start array
      map( CTX_NONE | BEFORE|FIRST|VAL, '[',  CTX_ARR | BEFORE|FIRST|VAL )
      map( CTX_ARR  | BEFORE|FIRST|VAL, '[',  CTX_ARR | BEFORE|FIRST|VAL )
      map( CTX_OBJ  | BEFORE|FIRST|VAL, '[',  CTX_ARR | BEFORE|FIRST|VAL )
      map( CTX_NONE | BEFORE|VAL,       '[',  CTX_ARR | BEFORE|FIRST|VAL )
      map( CTX_ARR  | BEFORE|VAL,       '[',  CTX_ARR | BEFORE|FIRST|VAL )
      map( CTX_OBJ  | BEFORE|VAL,       '[',  CTX_ARR | BEFORE|FIRST|VAL )
    
      // start object
      map( CTX_NONE | BEFORE|FIRST|VAL, '{',  CTX_OBJ | BEFORE|FIRST|KEY )
      map( CTX_ARR  | BEFORE|FIRST|VAL, '{',  CTX_OBJ | BEFORE|FIRST|KEY )
      map( CTX_OBJ  | BEFORE|FIRST|VAL, '{',  CTX_OBJ | BEFORE|FIRST|KEY )
      map( CTX_NONE | BEFORE|VAL,       '{',  CTX_OBJ | BEFORE|FIRST|KEY )
      map( CTX_ARR  | BEFORE|VAL,       '{',  CTX_OBJ | BEFORE|FIRST|KEY )
      map( CTX_OBJ  | BEFORE|VAL,       '{',  CTX_OBJ | BEFORE|FIRST|KEY )
    
      // values (no context)
      map( CTX_NONE | BEFORE|FIRST|VAL, val,  CTX_NONE | AFTER|VAL )
      map( CTX_NONE | AFTER|VAL,        ',',  CTX_NONE | BEFORE|VAL )
      map( CTX_NONE | BEFORE|VAL,       val,  CTX_NONE | AFTER|VAL )   // etc ...
                                              
      // array values
      map( CTX_ARR | BEFORE|FIRST|VAL,  val,  CTX_ARR | AFTER|VAL )
      map( CTX_ARR | AFTER|VAL,         ',',  CTX_ARR | BEFORE|VAL )
      map( CTX_ARR | BEFORE|VAL,        val,  CTX_ARR | AFTER|VAL )   // etc ...
    
      // object fields
      map( CTX_OBJ | BEFORE|FIRST|KEY,  '"',  CTX_OBJ | AFTER|KEY )
      map( CTX_OBJ | AFTER|KEY,         ':',  CTX_OBJ | BEFORE|VAL )
      map( CTX_OBJ | BEFORE|VAL,        val,  CTX_OBJ | AFTER|VAL )
      map( CTX_OBJ | AFTER|VAL,         ',',  CTX_OBJ | BEFORE|KEY )
      map( CTX_OBJ | BEFORE|KEY,        '"',  CTX_OBJ | AFTER|KEY )  // etc ...
    
      // end array or object. context is not set here. it will be set by checking the stack
      map( CTX_ARR | BEFORE|FIRST|VAL,  ']',  AFTER|VAL )   // empty array
      map( CTX_ARR | AFTER|VAL,         ']',  AFTER|VAL )
      map( CTX_OBJ | BEFORE|FIRST|KEY,  '}',  AFTER|VAL )   // empty object
      map( CTX_OBJ | AFTER|VAL,         '}',  AFTER|VAL )
    
      return ret
    }



To make the graph tolerate trailing commas in arrays <code>[1,2,3,]</code>, add an array-end rule where a 
value is expected (before-value):

      map( CTX_ARR | BEFORE|VAL,        ']',  AFTER|VAL )    // whenever an object or array is ended, we don't set context - that is done using the stack
      
      
To make the graph also tolerate trailing commas in an empty array <code>[,]</code>, add an array-comma rule where 
a first value is expected (before-first-value):

      map( CTX_ARR | BEFORE|FIRST|VAL,  ',',  CTX_ARR | BEFORE|VAL )

Still not clear?  See the example in the next section that maps these states to an exmaple JSON snippet.

## How it works - Understanding the parse graph (state and stack)

Even if you aren't familiar with bit twiddling, you can easily understand and modify the efficient parse graph.  The
graph is defined as a series of allowed state transitions.  If the state graph is in a variable called 'states', then we
could check and perform state transition from state0 (current state) to state1 (next state) with:

    var state1 = states[state0 + ascii-value]

If the state isn't allowed, then state1 is undefined.  If allowed, then it is defined (an integer) that can be
used again to get the next state:

    var state2 = states[state1 + ascii-value]
    
This simple mechanism works for all state transitions, except when we leave context of an object or array.  
When a '}' or ']' is encountered, the new state will have no context set (you can see this for yourself in
the Adding Custom Rules to Parsing section, above).

When closing an object or array, the 'stack' is used to supplement missing context:

   state1 |= stack.length === 0 ? CTX_NONE : (stack[stack.length - 1] === 91 ? CTX_ARR : CTX_OBJ)
 

### The 'stack'

Brace matching is tracked as an array of integers (ascii brace codes) called the 'stack' that stores all 
the open unmatched ascii braces.

    var A = 91      // ascii for '[' - array start
    var O = 123     // ascii for '{' - object start                                    
    stack = []
    
    [] |[O]                         |[O,A]           | [O]    | []
       |                            |                |        |
       {  name :  "Samuel" , tags : [ "Sam", "Sammy" ]        } ,  "another value"
    
### The Components of the 'state' Integer
 
Each state integer holds context information about the current parsing context is in the JSON document.  
There are three possible  *contexts*: **CTX_OBJ**, **CTX_ARR**, **CTX_NONE** that define the type of 
container the parser is within: 

    CTX_NONE  |           CTX_OBJ           |     CTX_ARR    |  CTX_OBJ  |  CTX_NONE
              |                             |                |           |          
              { "name" : "Samuel", "tags" : [ "Sam", "Sammy" ]           }

State also describes which of the 2 item types: **KEY** or **VAL**(UE) the position of the parser is near.  Note that
bothe the start and end of arrays and objects
are considered a VALUES when describing position. 

       VALUE                                          VAL
       |   KEY     VAL     KEY   VAL              VAL  |
       |    |       |       |     |  VAL      VAL  |   |
       |    |       |       |     |   |       |    |   |
       {  name : "Samuel", tags : [ "Sam", "Sammy" ]   }
        

There are 3 possible *positions*, **BEFORE**, **AFTER**, and **INSIDE**, that define parse position relative to a key 
or value plus a **FIRST** indicator to indicate if it is the first item in a new context: 

    CTX_NONE|BEFORE|FIRST|VAL 
      |  
      |  CTX_OBJ|BEFORE|FIRST|KEY
      |  |
      |  |    CTX_OBJ|AFTER|FIRST|KEY
      |  |    |
      |  |    | CTX_OBJ|BEFORE|FIRST|VAL
      |  |    | |
      |  |    | | CTX_OBJ|INSIDE|FIRST|VAL
      |  |    | | |
      |  |    | | |       CTX_OBJ|AFTER|FIRST|VAL
      |  |    | | |       |
      |  |    | | |       | CTX_OBJ|BEFORE|KEY         (notice it is no longer FIRST)
      |  |    | | |       | |
      |  |    | | |       | | CTX_OBJ|INSIDE|KEY
      |  |    | | |       | | |
      |  |    | | |       | | |  CTX_OBJ|AFTER|KEY
      |  |    | | |       | | |  |
      |  |    | | |       | | |  | CTX_OBJ|BEFORE|VAL
      |  |    | | |       | | |  | |
      |  |    | | |       | | |  | | CTX_ARR|BEFORE|FIRST|VAL
      |  |    | | |       | | |  | | |
      |  |    | | |       | | |  | | |  CTX_ARR|INSIDE|FIRST|VAL
      |  |    | | |       | | |  | | |   |
      |  |    | | |       | | |  | | |   | CTX_ARR|AFTER|FIRST|VAL
      |  |    | | |       | | |  | | |   | |
      |  |    | | |       | | |  | | |   | |CTX_ARR|BEFORE|VAL
      |  |    | | |       | | |  | | |   | ||
      |  |    | | |       | | |  | | |   | ||CTX_ARR|INSIDE|VAL
      |  |    | | |       | | |  | | |   | |||  
      |  |    | | |       | | |  | | |   | |||      CTX_ARR|AFTER|VAL
      |  |    | | |       | | |  | | |   | |||      | 
      |  |    | | |       | | |  | | |   | |||      | CTX_OBJ|AFTER|VAL
      |  |    | | |       | | |  | | |   | |||      | |        CTX_NONE|AFTER|FIRST|VAL
      |  |    | | |       | | |  | | |   | |||      | |        |
      |  |    | | |       | | |  | | |   | |||      | |        | CTX_NONE|BEFORE|VAL
      |  |    | | |       | | |  | | |   | |||      | |        | |
      |  |    | | |       | | |  | | |   | |||      | |        | | CTX_NONE|INSIDE|VAL
      |  |    | | |       | | |  | | |   | |||      | |        | | |
      |  |    | | |       | | |  | | |   | |||      | |        | | |              CTX_NONE|AFTER|VAL
      |  |    | | |       | | |  | | |   | |||      | |        | | |              |
       {  name :  "Samuel" , tags : [ "Sam", "Sammy" ]        } ,  "another value"
    

So state management is the matter of a bitwise-or and one or two array lookups per token.  Note that this work
could be reduced to just one bitwise-or and one array
lookup by expanding the states to include DEPTH state, which could make sense for parsing shallow JSON,
but we decided to track depth in a separate stack to keep code simple, the graph footprint small, and 
not risk crashing on deeply nested structures (up to max-safe-integer (2^53-1)).
