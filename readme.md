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

A fast, zero-dependency, *validating* JSON parser (~300 MB/sec running node 6 on 2.2 GHz Intel i7).

**qb-json-tokv introduces validation and incremental parsing!**

qb-json-tokv started out as an update to qb-json-tok (which is faster but with no validation), but winded up making more
sense as a new package.  Very fast JSON parsing under a complete validating parse-graph.

**Complies with the 100% test coverage and minimum dependency requirements** of 
[qb-standard](http://github.com/quicbit-js/qb-standard) . 


## Install

    npm install qb-json-tokv

# API

## tokenize (src, opt, callback)
  
Tokenize the given source array or buffer, sending all results to the given callback function. (the
process can be controlled/stopped via the function return value)

    src        A UTF-8 encoded buffer or array containing ANY JSON value such as an object, quoted
               string, array, or valid JSON number.  IOW, it doesn't have to be a {...} object.
               The values may also be a comma-separated list such as  '"abc", 37, 42.8, "hi"'
               
    opt
        off         offset into src to start processing
        lim         limit in src to stop processing
        init        (object) if provided, parse state will be initialized to these values to continue parsing.
            src         if a key or value was truncated, this will hold the truncated portion
            state0      integer holding context, position, and type (key or value). the section below has examples
            stack       array of '[' or '{' ascii codes (91 and 123) representing parse depth
                    
    
    callback   A function called for each token encountered.
    
        src         the buffer being parsed
        koff        index of key start (inclusive) in current object, in arrays koff is -1
        klim        index of key limit (non-inclusive) in current object, in arrays koff is -1
        tok         integer token representing the type encountered.  In most cases, token is the ASCII of the 
                    first character encountered.  'n' for null, 't' for true, '{' for object start.
                    The TOK property defines these token codes by name:
                        
                    var TOK = {
                      // ascii codes - the token is represented by the first ascii byte encountered
                      ARR_BEG: 91,    // '['
                      ARR_END: 93,    // ']'
                      OBJ_BEG: 123,   // '{'
                      OBJ_END: 125,   // '}'
                      FAL: 102,       // 'f'
                      NUL: 110,       // 'n'
                      STR: 34,        // '"'
                      TRU: 116,       // 't'
                      
                      // special codes
                      NUM: 78,        // 'N'  - represents a number value starting with: -, 0, 1, ..., 9
                      ERR: 0,         // error.  check callback info argument for information
                      BEG: 66,        // 'B' - begin - about to process
                      END: 69,        // 'E' - end -   buffer limit reached
                    }
                        
                        
        voff        index of value offset (inclusive) in current object or array
        vlim        index of value limit (non-inclusive) in current object or array
        
        info        (object) if tok === TOK.ERR or tok === TOK.END, then info holds all the details that can be 
                    used to recover or handle values split across buffers.  info.toString() gives 
                    useful details as well as methods that report the state in readable form such as:
                    
                        info.before()        true if state was positioned 'before' a key or value
                        info.key()           true if the state was positioned relative to a 'key' rather than 'value'
                        in_obj()             true if context was within an object
                        in_arr()             true if context was within an array 
                            (false for both in_arr() and in_obj() mean that parse state was in plain csv context)
                     
        return      return truthy to continue processing, falsey to halt processing (returning a true boolean may be 
                    slighty faster than other values)
                     

## TOK

Tokens passed to the callback by name (see the token callback parameter, above, for the list)

### Special tokens BEG(IN), END, ERR(OR)

When tokenizer begins processing of a source buffer, it sends a BEG begin token.  When it ends processing of a 
source buffer, it sends an END token along with information
in the 'info' parameter about the parse state.  When a value terminates unexpectedly, an ERR token is sent, 
again with an info object.

Even if you have an aversion to switch statements, this approach is handy because so long as there is 
a default handler, errors and other events won't be accidentally forgotten.  Switching on integers is
also the fastest multiway branching that can be achieved in javascript along with integer
array access.

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
                error('case not handled')    
        }
    }

### info
    
When tok is set to TOK.ERR or TOK.END, then the 'info' parameter will hold full
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

## Adding Custom Rules to Parsing

Though qb-json-tokv uses bit manipulation, we have tried to make the rules as readable as possible so even if
you aren't comfortable with bit twiddling, you may understand and modify the parse rules.  Can you see how
to make parsing tolerant of trailing commas by looking at the states below? (the answer is at the bottom of this section).
    
First, the setup.  We create an integer-to-integer mapping of all the allowed states.  The full parse graph is 
defined in 15 lines:

    // (s0 ctxs +       s0 positions + tokens) -> s1
    map([non],          [bfv,b_v],    val,      a_v)
    map([non],          [a_v],        ',',      b_v)
  
    map([non,arr,obj],  [bfv,b_v],    '[',      arr|bfv)
    map([non,arr,obj],  [bfv,b_v],    '{',      obj|bfk)
  
    map([arr],          [bfv,b_v],    val,      arr|a_v)
    map([arr],          [a_v],        ',',      arr|b_v)
    map([arr],          [bfv,a_v],    ']',      a_v)          // special... see comment
  
    map([obj],          [a_v],        ',',      obj|b_k)
    map([obj],          [bfk,b_k],    '"',      obj|a_k)
    map([obj],          [a_k],        ':',      obj|b_v)
    map([obj],          [b_v],        val,      obj|a_v)
    map([obj],          [bfk,a_v],    '}',      a_v)          // special... see comment  


That's pretty dense, and the codes look cryptic, but it is easy to see the 'big picture' once
you understand the abbreviations.  'non', 'arr', and 'obj' are contexts, for when we parsing is immediately
within an array, object - or nothing (zero depth - CSV parsing).

Parse positions are 
    
    before-first-valueue  'bfv'
    before-valueue        'bv'
    after-valueue         'av'
    
    before-first-key    'bfk'
    before-key          'bk'
    after-key           'ak'
    
    'val' holds all the legal ascii start values: 
    
        '"ntf-0123456789'
        
For example:
        
        
        arr|before-first-valueue    // array context...
        |
        |  
        |    
        |     arr|after-valueue
        |     |
        |     |arr|before-valueue
        |     ||
        |     ||
        |     ||   
        |     ||       arr|after-valueue
        |     ||       | 
        |     ||       | 
        |     ||       | 
        |     ||       | 
        |     ||       | 
        |     ||       | 
        |     ||       |  
        |     ||       |   
        |     ||       | 
        |     ||       | 
       [ "Sam", "Sammy" ]
        
(See the section below: The Components of the 'state' Integer, for more examples)        
    
So mappings are read like this:
    
    map([non,arr,obj],  [bfv,b_v],    '[',      arr|bfv)
    
    // means:

    for contexts (none, in-array and in-object)            
        for positions (before-first-valueue and before-valueue) 
            for token ('[')
    
                allow transition to state:
            
                    in-array, before-first-valueue


    // and this mapping:
    
    map([arr],          [bfv,b_v],    val,      arr|a_v)
    
    // means:
    
    for the context (array-context)
        for positions (before-first-valueue, before-valueue)
            for tokens ('"ntf-0123456789')                  (all legal value start ascii)
            
                allow transition to state:
                    
                    in-array-after-valueue
                    
    and so on...           
        
                
If that made sense, I encourage looking at the code - it is just as understandable as that... 

    // create an int-int map from (state | tok) -- to --> (new state)
    function state_map () {
      var ret = []
      var max = 0x1AFF      // accommodate all possible byte values
      for (var i=0; i <= max; i++) {
        ret[i] = 0
      }
    
      // map ( [ctx], [state0], [ascii] ) => state1
      var map = function (ctx_arr, s0_arr, chars, s1) {
      ctx_arr.forEach(function (ctx) {
        s0_arr.forEach(function (s0) {
          for (var i = 0; i < chars.length; i++) {
            ret[ctx|s0|chars.charCodeAt(i)] = s1
          }
        })
      })
    
    ...


To make the graph tolerate trailing commas in arrays <code>[1,2,3,]</code>, add an array-end rule where a 
value is expected (before-valueue):

      map([arr],    [b_v],        ']',     a_v )    // note that we don't set a context for ending array or objects - that is done for us using the stack
      
  In fact, if you look above, this looks extremely similar to the existing 'bfv' + ']' rule that allows arrays to close without
  any content at all:

      map([arr],    [bfv, a_v],   ']',     a_v)        
      
      ... and we could have just added our case to that rule instead, if we liked
      
      map([arr],    [bfv, b_v, a_v],   ']',     a_v)        
      
      
To make the graph also tolerate trailing commas in an empty array <code>[,]</code>, add an array-comma rule where 
a first value is expected (before-first-valueue):

      map([arr], [bfv], ',',  arr|b_v )

Still not clear?  See the example in the next section that maps these states to an exmaple JSON snippet.

## How it works - Understanding the parse graph (state and stack)

Even if you aren't familiar with bit twiddling, you can easily understand and modify the efficient parse graph.  The
graph is defined as a series of allowed state transitions.  If the state graph is in a variable called 'states', then we
could check and perform state transition from state0 (current state) to state1 (next state) with:

    var state1 = states[state0 + ascii-valueue]

If the state isn't allowed, then state1 is undefined.  If allowed, then it is defined (an integer) that can be
used again to get the next state:

    var state2 = states[state1 + ascii-valueue]
    
This simple mechanism works for all state transitions, except when we leave context of an object or array.  
When a '}' or ']' is encountered, the new state will have no context set (you can see this for yourself in
the Adding Custom Rules to Parsing section, above).

When closing an object or array, the 'stack' is used to supplement missing context (91 is ascii for array-close):

    if (stack.length !== 0) { state1 |= (stack[stack.length - 1] === 91 ? in_arr : in_obj) }
 

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
There are three possible *contexts*: **in-object**, **in-array**, and **none** that define the type of 
container the parser is within: 

    no context |        in-object            |    in-array    | in-object |  no context...
               |                             |                |           |          
               { "name" : "Samuel", "tags" : [ "Sam", "Sammy" ]           }

State also describes which of the 2 item types: **key** or **value**(UE) the position of the parser is near.  Note that
both the start and end of arrays and objects
are considered a values when describing position. 

      value                                          value
       |   key    value    key  value            value |
       |    |       |       |     | value   value  |   |
       |    |       |       |     |   |       |    |   |
       {  name : "Samuel", tags : [ "Sam", "Sammy" ]   }
        

There are 2 possible *positions* **before**, and **after**, that define parse position relative to a key 
or value plus a **first** indicator to indicate if it is the first item in a new context: 

    before-first-value (no context)
      |  
      |  in-object|before-first-key        // object context...
      |  |
      |  |    in-object|after-key
      |  |    |
      |  |    | in-object|before-value
      |  |    | |
      |  |    | | 
      |  |    | |  
      |  |    | |         in-object|after-value
      |  |    | |         |
      |  |    | |         | in-object|before-key        
      |  |    | |         | |
      |  |    | |         | | 
      |  |    | |         | |  
      |  |    | |         | |    in-object|after-key
      |  |    | |         | |    |
      |  |    | |         | |    | in-object|before-value
      |  |    | |         | |    | |
      |  |    | |         | |    | | in-array|before-first-value    // array context...
      |  |    | |         | |    | | |
      |  |    | |         | |    | | |  
      |  |    | |         | |    | | |    
      |  |    | |         | |    | | |     in-array|after-value
      |  |    | |         | |    | | |     |
      |  |    | |         | |    | | |     |in-array|before-value
      |  |    | |         | |    | | |     ||
      |  |    | |         | |    | | |     ||
      |  |    | |         | |    | | |     ||   
      |  |    | |         | |    | | |     ||       in-array|after-value
      |  |    | |         | |    | | |     ||       | 
      |  |    | |         | |    | | |     ||       | in-object|after-value  // object context...
      |  |    | |         | |    | | |     ||       | |           after-value  // no context... (basic CSV is supported)
      |  |    | |         | |    | | |     ||       | |           |
      |  |    | |         | |    | | |     ||       | |           | before-value
      |  |    | |         | |    | | |     ||       | |           | |
      |  |    | |         | |    | | |     ||       | |           | | 
      |  |    | |         | |    | | |     ||       | |           | |  
      |  |    | |         | |    | | |     ||       | |           | |                after-value
      |  |    | |         | |    | | |     ||       | |           | |                |
       {  name :  "Samuel" , tags : [ "Sam", "Sammy" ]        }    ,  "another value"
    

So state management is the matter of a bitwise-or and one or two array lookups per token.