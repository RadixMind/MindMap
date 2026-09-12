# Open MindMap domain context

This glossary records the terms used by the v0.9.0 refactor. It is deliberately small: a term belongs here when it describes a stable concept that crosses more than one module.

## Domain terms

### Document

The complete mind map value: root nodes, node attributes, direction, theme, and parsed metadata. A Document is the data owned by the Document Runtime. The viewport is not part of the Document.

### Node

A stable identified item in a Document. A Node has text, optional namespaced attributes, and optional child Nodes. Node identity must remain usable across parsing, patch application, layout, selection, and streaming updates.

### Viewport

The presentation state for a rendered surface: translation and zoom. Viewport changes affect what is visible, not the Document and not the Document history.

### Projection

A derived representation of a Document for a consumer. The primary Projection is layout: positioned nodes, edges, bounds, and lookup indexes. A Projection may be recomputed from the Document without becoming an additional source of truth.

### Document Runtime

The headless module that owns Document normalization, parsing, serialization, patch application, subscriptions, selection, and the controller interface. It must remain usable without React or browser DOM objects.

### Feature

An optional editor capability that consumes the controller interface and contributes UI or commands. History, search, import, export, Markdown editing, and AI are Features. A Feature must not create a second Document source of truth.

### Extension

A syntax or render contribution that participates in parsing, serialization, layout, or edge transformation. Extensions add namespaced behavior to Nodes while the core Node shape stays stable.

### Transaction

A grouped set of Document changes with one user-visible history meaning. A drag gesture or one AI generation may contain several intermediate changes but commits one undoable result. Selection and Viewport changes are outside Document Transactions.

### Patch

An explicit Document change such as insert, remove, update, move, or replace. A Patch is the unit used to publish incremental changes and, after the refactor, must have a corresponding inverse or equivalent reversible representation for history.

### Stream

An incremental source of Markdown or generated content. The Stream preserves parser state across chunks, coalesces updates at the selected scheduling seam, and publishes Document plus Patch updates through the Document Runtime.

## Architecture vocabulary

These terms describe the shape of the code rather than a product feature.

### Module

A unit with a focused responsibility and a smaller interface than its implementation. The Document Runtime, Projection, React adapter, Feature, and Extension modules are the main v0.9.0 modules.

### Interface

The stable set of inputs, outputs, events, and ownership rules exposed by a module. The interface is the test surface; tests should exercise the controller and public entry points rather than reach into implementation details.

### Depth

The amount of complexity a module absorbs behind its interface. A deep module makes the caller simple while keeping its internal policy local.

### Seam

A deliberate point where one module can be replaced or tested independently. The headless controller is the seam between Document policy and React rendering; a Feature interface is the seam between editor behavior and optional UI.

### Adapter

A thin module that translates one interface into another. The React adapter subscribes to the Document Runtime and maps its snapshot to React rendering. It must not duplicate Document policy.

### Locality

How much of a change can be understood and verified in one place. Transactions, Patch inversion, and layout invalidation should keep related decisions local to the Document Runtime or Projection module.

### Leverage

The amount of downstream behavior controlled by one well-defined interface. A controller change has leverage across Static, Viewer, Editor, Features, and the site because they consume the same Document contract.

### Deletion test

An architecture check: deleting a proposed module should concentrate complexity in a clearly worse place if the module is deep. If deletion only moves forwarding code, the module is too shallow to justify its seam.

## Invariants for the refactor

- Document, Projection, and Viewport remain separate sources of state.
- Core modules do not import React, browser globals, or CSS.
- Public package entries resolve to the same TypeScript runtime; legacy, cognitive, and fallback entries are not part of the v0.9.0 contract.
- Features and Extensions consume the public interfaces instead of reaching through private implementation paths.
- Published snapshots and Documents are treated as read-only by consumers; defensive enforcement is an explicit release requirement until R22 is verified.
- Documentation reports verification status separately from intended behavior.
