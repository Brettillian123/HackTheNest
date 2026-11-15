# Spec: CSV export for expense-tracker

What to build so a user can download their expenses as a CSV file.

## Goal

Let a signed-in user download all of their own expenses as one CSV file to open in a spreadsheet.

## Requirements

1. Add the endpoint `GET /api/expenses/export`.
2. It returns only the signed-in user's expenses.
3. The response has the header `Content-Type: text/csv`.
4. The first row is the header `date,amount,category,note`, and every row uses that column order.
5. Dates use the form `YYYY-MM-DD`.
6. If the user has more than 10,000 expenses, return status `413` and no file.

## Out of scope

- Excel files.
- Scheduled or emailed exports.

## Open questions

- Whether deleted expenses are included is not decided. Do not build either behaviour until the team answers.

## Done when

1. Each requirement above has a test.
2. This command passes:

```bash
npm test -- export
```
