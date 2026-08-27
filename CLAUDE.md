# Our Space

Our Space is a private shared web application for couples, especially couples who are not physically together.

The product should feel like a shared digital room where both partners can do activities together, see shared state, and build shared history.

## High-Level Architecture

Use a modular monolith.

Backend:
- Python
- Django
- Django REST Framework where useful
- PostgreSQL

Frontend:
- React
- TypeScript

Communication:
- REST for normal application operations and persistence
- WebSockets only where realtime behavior is actually required

Do not introduce:
- microservices
- Kubernetes
- separate databases per domain
- distributed messaging infrastructure
- unnecessary service-to-service communication

Do not change these high-level architectural decisions without first explaining:
1. the problem with the current design
2. the proposed alternative
3. the trade-offs
4. why the change is necessary now

## MVP Scope

The MVP should remain small and should prove this flow:

1. User registration/login
2. Two users pair into one private couple space
3. Both users see the same shared home
4. Basic presence
5. Start a shared session
6. Shared state can update in realtime
7. Support simple Watch, Gaming, and Fitness sessions
8. Maintain simple shared progress/history
9. Use an existing service for video calling/screen sharing
10. Deploy the application for remote use

Do not expand beyond the MVP unless explicitly approved.

## Engineering Rules

Prefer:
- clear domain boundaries
- separation of concerns
- readable code
- simple abstractions
- targeted tests
- small understandable commits
- practical solutions over fashionable patterns

Do not add abstractions simply because they are common in another framework.

Do not force ASP.NET patterns into Django if Django provides a simpler appropriate approach.

## Claude Code Working Rules

For meaningful changes:
- inspect relevant files before editing
- keep tasks bounded
- avoid unrelated refactors
- do not modify unrelated architecture
- do not add dependencies without explaining why
- prefer targeted tests over running unrelated test suites
- preserve existing behavior unless the task requires changing it
- explain important changes after implementation

For larger or ambiguous changes:
- inspect first
- propose a plan
- wait for approval before implementation

For tiny obvious changes:
- do not waste time or tokens on elaborate plans

## Context Efficiency

Use minimum sufficient context.

More context does not automatically mean better context.

Prefer:
- intent
- relevant files
- architecture boundary
- constraints
- expected behavior
- acceptance criteria

Avoid:
- scanning the entire repository unnecessarily
- repeating project history
- regenerating entire files for tiny changes
- unrelated refactors
- oversized implementation requests
- unnecessary dependencies

## AI Policy

Claude Code helps build the application.

The MVP itself does not require an LLM.

Do not add AI product functionality unless explicitly approved.

## Testing Strategy

Use a balanced testing strategy appropriate for a fast-moving MVP.

Testing should provide confidence in important behavior without slowing development through unnecessary test coverage.

Backend testing should include:
- focused unit tests for meaningful business/domain logic
- API/integration tests for important Django REST API behavior
- authentication, authorization, and couple data-isolation rules where relevant

Frontend testing should include:
- targeted component tests for important interactive behavior
- state and error behavior where testing provides meaningful value

End-to-end testing should include:
- a small number of tests covering critical user journeys
- prioritize important flows such as authentication, couple pairing, shared sessions, and shared state

Manual verification remains part of the development workflow, especially for realtime and user-experience behavior.

Do not:
- write tests merely to increase a coverage percentage
- test trivial implementation details
- create large test suites for low-risk behavior
- run unrelated test suites for every small change

For each feature, determine the appropriate testing level based on its behavior and risk.

Before a feature is considered complete:
1. Run relevant automated tests.
2. Verify important behavior manually.
3. Review failures rather than bypassing tests.
4. Confirm existing relevant behavior still works.

## Git Workflow

Use a lightweight professional Git workflow appropriate for a solo developer.

Branching:
- `master` is the stable primary branch
- Do not develop features directly on `master`
- Create short-lived feature branches for meaningful work
- Use descriptive branch names such as:
  - `feature/couple-pairing`
  - `feature/shared-room`
  - `fix/session-sync`
  - `chore/ci-pipeline`
- Merge completed and verified work back into `master`
- Delete feature branches after they are merged

Do not introduce a permanent `dev` branch unless the project grows to a point where it provides a clear benefit.

Keep commits small, understandable, and focused on one logical change.

Before committing:
- review the changes
- verify relevant functionality
- run appropriate targeted tests
- avoid committing secrets, environment files, generated files, or unrelated changes

## CI/CD Direction

This project will eventually use CI/CD through GitHub Actions.

The intended progression is:

1. Build features locally
2. Test and verify changes
3. Push feature branches to GitHub
4. Add automated CI checks for appropriate branches/pull requests
5. Merge verified changes into `master`
6. Eventually automate deployment from the repository

Do not build the entire CI/CD system prematurely.

When CI/CD is introduced, prefer a simple pipeline appropriate for the current architecture and deployment environment rather than unnecessary enterprise complexity.

## Repository Structure

Keep the frontend and backend as separate top-level applications inside the same Git repository.

Conceptually:

```text
our-space/
├── backend/
└── frontend/
```

### Backend

`backend/` contains the Django application.

Use Django apps to represent meaningful backend domain boundaries.

Initial backend structure should conceptually resemble:

```text
backend/
├── config/
├── accounts/
└── couples/
```

Django-specific files such as models, services, serializers, views, permissions, URLs, and tests belong inside their appropriate backend app.

Do not place React/frontend code inside Django apps.

### Frontend

`frontend/` contains the React + TypeScript application.

Use a lightweight feature-oriented structure with clear separation between route-level pages, reusable shared components, and feature-specific code.

Conceptually:

```text
frontend/src/
├── app/
├── pages/
├── components/
│   └── shared/
├── features/
│   ├── auth/
│   └── couples/
├── api/
├── hooks/
└── types/
```

Keep feature-specific components, API logic, hooks, and types near their feature where appropriate.

Do not create excessive folders or abstractions before they are needed.

Route-level screens belong in `pages/`.

Truly reusable UI elements belong in shared `components/`.

The frontend and backend communicate through the REST API rather than importing application logic from one another.

## CODE READABILITY AND COMMENTS

Code should remain understandable to a human engineer reviewing AI-generated work.

Prefer:
- clear names,
- small focused functions/classes,
- straightforward control flow,
- established framework conventions.

Add comments or docstrings when they explain:
- non-obvious business rules,
- architectural decisions,
- security behavior,
- framework-specific behavior that is easy to misunderstand,
- unusual workarounds or implementation constraints.

Do not add comments that merely restate obvious code line-by-line.

For important new framework-specific code, prefer concise docstrings/comments that explain WHY the code exists and its responsibility.

## Implementation Flow Explanations

For any meaningful feature or vertical-slice implementation:

- After implementation, provide a short visual flow showing how the main pieces interact.
- Show the request/data flow in execution order, not just a list of files.
- Clearly distinguish:
  - visible UI/pages,
  - reusable UI components,
  - frontend state/context,
  - API/client communication,
  - backend endpoints/services,
  - database interaction when applicable.
- Use a compact ASCII diagram with arrows.
- Mention the main files responsible at each step.
- Do not create diagrams for trivial edits or individual bug fixes unless the flow changes.
- Keep explanations concise and focused on helping the developer understand and explain the architecture.