# design patterns

## creational

- __abstract factory__ - factory of factories, create families of related objects, _java swing look and feels_
- __builder__ - solution to the telescoping constructor anti-pattern, _string builder_
- __dependency injection__
    - classes get their dependencies injected at run-time instead of creating them directly
    - a dependency is an object that can be used (_a service_)
    - an injection is the passing of a dependecy to a dependent object (_a client_)
    - the service is made part of the client state
    - fundamental requirement of the pattern: the service must be passed to the client rather than allowing the client to build or find the service
- __factory method__ - create object without specifying the exact class of the object
- __lazy initialization__ - delay the creation or object/value until the first time it is needed, _lazy initialized collection in hybernate_ (old skool)
- __multiton__ - ensure a class has only named instances, _enums_
- __object pool__ - avoid expensive acquisition and release of resources by recycling objects that are no longer in use, _thread pools_
- __prototype__ - create new projects from a skeleton of an existing project, _encountered it in some old projects where we needed multiple entities cloned from a prototype that already had required service dependencies injected_
- __singleton__ - ensure a class has a single object and provide a global point of access to it

## structural

- __adapter / wrapper / translator__ - convert the interface of a class into another interface clients expect, _convert XML DOM into tree structure_
- __bridge__ - we have one hierarchy for an abstraction (interface and implementation) and a separate hierarchy for its implementation (interface and implementation), the abstraction implementation _delegates_ the operation execution to the implementation interface (the abstraction implementation has a reference to the implementation interface); the code is finally executed by the implementation implementation
- __composite__ - compose objects into tree structures, _building complex database/collection queries/filters_
- __decorator__ - an alternative to subclassing, attach additional responsibilities to an object dynamically while keeping the same interface, or change some functionality, _one example would be a windowing system, with a base window class that we can add functionality to, like scrolling, with a scrolling window decorator, or borders, with a borders decorator, or both_
- __facade__ - unified interface to a set of interfaces in a subsystem, hide the complexities of an entire system with a simplified interface, hide interworking of classes
- __flyweight__ - minimize memory use by sharing as much data as possible with other similar objects, _like when using references to character glyphs (containing font outline, font metrics) inside a document, instead of repeatedly adding the whole memory representation of the character to the document_
- __marker__ - associate metadata with class, _serializable_
- __module__ - group several related elements into a single conceptual entity, _java modules, when used right_
- __proxy__ - provide a surrogate or placeholder for another object to control access to it, _remotely accessing classes in other JVMs, on other machines_

## behavioral

- __chain of responsibility__ - avoid coupling the sender of a request to its receiver by giving more than one object a chance to handle the request, _catching java exceptions_
- __command__ - encapsulate a request as an object, _Action objects added to Swing buttons or menu items, used to implement undo, remoting over the network_
- __interpreter__ - language and grammar, _domain specific language_
- __iterator__ - provide a way to access the elements of an aggregate object sequentially without exposing its underlying representation
- __mediator__ - encapsulate how a set of objects interact, promotes loose coupling, _when assigning resource access to users/groups through an object managing the permissions_ (many to many relationship promoted to full object status)
- memento - capture and externalize an object's internal state (without violating encapsulation) allowing the object to be restored to this state, the object itself is responsible for saving its internal state to memento, _the seed of a pseudorandom number generator_
- __null object__ - avoid null references by providing a default object, _like the ends of a doubly-linked list in some implementations, or java 8 Optional_
- __observer__ (publish/subscribe) - define a one-to-many dependency between objects where a state change in one object results in all its dependents being notified and updated automatically; _listeners_
- __state__ - allow an object to alter its behavior when its internal state changes, define specific state object encapsulating state behavior, _vending machine?_
- __strategy__ - define a family of algorithms, encapsulate each one, and make them interchangeable; _sorting with comparators_
- __template method__ - define the skeleton of an algorithm in an operation, deferring some steps to subclasses; lets subclasses redefine certain steps of an algorithm without changing the algorithm's structure, _like an animal (abstract) class move method, where subclasses like fish swim, birds fly, horses gallop, men walk_
- __visitor__ - represent an operation to be performed on the elements of an object structure, _like enzymes in the DNA replication process, or saving a vector drawing to SVG or some other proprietary format with different visitors that know how to save each shape in the hierarchy_

# concurrency
    - join
    - lock
    - monitor object
    - thread pool
