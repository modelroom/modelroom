# {{room}} — behaviour

What this room promises: operations and their results. Keep the wording in the language of
the work, not of the code.

```gherkin
Feature: {{room}}

  @first-1
  Scenario: a first promise
    Given some starting point
    When the person does something
    Then something observable happens
```

Notes
- One id per promise (`@<verb>-<n>`), and one promise per scenario.
- Promises that need the real system (records, timestamps, permissions) belong to the
  application, not to this file.
