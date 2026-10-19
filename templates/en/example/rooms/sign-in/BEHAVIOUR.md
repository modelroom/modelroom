# sign-in — behaviour

What this room promises.

```gherkin
Feature: sign in

  @sign-in-1
  Scenario: correct credentials
    Given the sign-in screen is open
    When the person submits a valid email and password
    Then the screen reports success and leaves for the next room

  @sign-in-2
  Scenario: wrong credentials
    Given the sign-in screen is open
    When the person submits a password that does not match
    Then the screen stays, and explains in one sentence that the details did not match
```

Notes
- The room does not decide how credentials are checked — that belongs to the application.
- `@sign-in-2` must not reveal whether the email exists.
