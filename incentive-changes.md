# Incentive Module – What Changed

**Prepared:** 15 September 2026
**Written for:** anyone, including people who did not build this.

Every item below was checked against the actual system before being listed.
Nothing that was only discussed is described as done. Anything unfinished is
listed at the end under **Partially Completed / Not Done**.

---

### New Incentive Request (the request form)

1. Mobile numbers are now checked. Only a 10-digit number starting with 6, 7, 8 or 9 is accepted — no +91, spaces or dashes.
2. Email addresses are now checked, so a wrongly typed email cannot be submitted.
3. Web links must start with http:// or https://, and number boxes (such as Approx People) must contain a valid number.
4. "BSS Conversion" is renamed **"Conversion"**. Older requests show the new name automatically.
5. Conversion requests now need a **Product**, picked from the list of products switched on in Admin → Products. When an admin adds or switches off a product there, the list updates by itself.
6. New request type: **Leads / Referrals**. It asks for the participant's first and last name, the workshop name, the batch number, an optional link or attachment link, and notes.
7. **"Video Testimonial"** is a new choice under Client Happiness.
8. Client Happiness requests for a **Case Study** or a **Video Testimonial** must say whether the client gave **permission to publish** (Yes or No — nothing is pre-selected).
9. Every request now needs an **Incentive Date** — the date the incentive was earned. It is shown like 15-Sep-2026.
10. Every request type now has a **Notes** box (Conversion did not have one before), and notes can be **typed by voice**.
11. An incentive can be **split between 2 and 5 people**. The person filing must be one of them, everyone must be a current employee, and the percentages must add up to exactly 100%. Shares are divided equally to start with, and custom percentages can be typed in (up to 2 decimal places).
12. The form is now laid out in **two columns** on larger screens. Each mistake is shown under the box it belongs to, with a summary list of everything still to fix, and the Submit button always stays in view.
13. The hint in mobile number boxes now reads "10-digit mobile number" instead of "+91 XXXXX XXXXX" (the old hint would have failed the new check).
14. These checks cannot be skipped: every request is checked again when it is received, including any request sent from the mobile app.

### Approval

15. **Only Manan Vasa can decide incentive requests.** Other admins can still see every request but can no longer approve or reject them (before this change, any admin could).
16. Manan sees a **"Needs your review"** list first: every request that is Pending Approval, Due or Not Due.
17. For most incentives Manan can choose: **Approved, Not Approved, Due, Not Due or Reversed**.
18. For content that gets published — Client Happiness requests for a LinkedIn Testimonial, an Interview or a Case Study — Manan instead chooses **Publish, Revise or Not Approved**. Publish counts as Approved.
19. A **reason is required** for Not Approved and Reversed, and a **revision note is required** for Revise. Notes on the other choices are optional. Notes can be up to 2,000 characters and can be typed by voice.
20. Before a decision is saved, Manan is asked to confirm, and the confirmation names the status the request will move to.
21. Only sensible next steps are offered: an Approved incentive can only be Reversed; Reversed is final; Due and Not Due can still be decided; a Not Approved request waits for the employee to resubmit.
22. Status names changed: "Pending" is now **"Pending Approval"** and "Rejected" is now **"Not Approved"**. New statuses: **Due, Not Due, Reversed and Revision Requested**. Each status has its own colour everywhere it appears.
23. If two people act on the same request at the same moment, the second person is asked to reload the page instead of overwriting the first decision.

### Rejection and Resubmission

24. When a request is Not Approved or sent back for revision, the employee sees the reason and when the decision was made.
25. The employee can **Justify & Resubmit**. Their original answers are filled in and can be corrected (the request type cannot be changed), a justification is required, and the request goes back to Manan as Pending Approval.
26. Every version of a request and every decision is kept as a **history**, with the date and time, who acted, and why. The history cannot be edited.
27. Requests that already existed were given the start of their history automatically, so older requests show a history too.

### Incentive Dashboard and Analytics

28. A new **Incentive Dashboard** is now the first thing on the Incentive page.
29. You can choose the period: **Current Month, a Specific Month, Last 3 Months, Last 6 Months, or Year to Date** (January to today).
30. Six **summary cards** — Not Approved, Approved, Due, Not Due, Paid and Unpaid — each show a count and an amount. Clicking a card lists the records behind it, and the list can be searched by employee name or employee code.
31. **Your performance** shows your incentive earned, what percentage of your CTC it is, your grade and your rank.
32. The **Employee Grade Report** lists each person's incentive earned, CTC for the period, % of CTC, grade, and target against actual.
33. **Who sees what:** admins, the super admin and Manan see everyone. A manager or team lead sees themselves and everyone who reports to them, directly or further down. Everyone else sees only themselves. CTC figures are shown only to people who can see everyone, and to each person for themselves.
34. People who have left the company are not counted. Manan Vasa, Dattaram Kap and Parvez Khan are left out by default, as they were before.
35. A request is valued at the amount set for its incentive in the Incentive Table. Incentives that are paid per batch show **"amount not set"** rather than ₹0 or a guess.
36. The previous **year overview** (monthly charts, leaderboard and incentive-name totals) is still there, folded away below the dashboard, and only for people who can see everyone.

### Targets

37. The dashboard **warns when this month's or next month's target is missing**.
38. An employee can **fill in their own missing target** for this month or next month straight from the dashboard. Changing a target that already exists is still done by an admin.
39. On the Targets tab, managers and employees now see only the people they are allowed to see.

### Employee Grading and Ranking

40. **Grades** are based on incentive earned as a percentage of CTC: **A** above 20% · **B** 10.01% to 20% · **C** 5.01% to 10% · **D** up to 5% (including no incentive).
41. The percentage is rounded to two decimals before the grade is worked out, so the grade always matches the number on screen.
42. People are **ranked** by % of CTC. Equal scores share the same rank, and each rank shows whether the person moved up or down since the previous period. Nobody is ranked without a CTC on record.

### Incentive Master / Incentive Chart

43. Every time an incentive is **added, changed or removed** in the Incentive Table, a permanent record is kept of what it looked like before and after, and who made the change.
44. Saving an incentive without really changing anything creates no record and notifies nobody.

### Employee Eligibility

45. When an incentive is added, changed or removed, the people told about it depend on its **Sales Eligible** and **Interns Eligible** settings. Anyone whose designation contains Intern, Trainee or Apprentice counts as an intern; everyone else counts as sales. Only current, active employees are included.

### Accounts / Incentive Payment

46. When Accounts pays an incentive — through the salary incentive payout, or by raising the paid amount on an incentive — the employee is **told it has been paid**. How amounts are worked out and paid has **not** changed.

### Notifications

47. There is a new **Incentive** group in the Inbox, and incentive notices also arrive as **push notifications**.
48. **Employees are notified** when: a new incentive they are eligible for is added; an incentive is updated; they are no longer eligible (with the date it takes effect); an incentive is removed; their request is Approved, Published, Not Approved (with the reason), needs a Revision (with the note), is marked Due, is marked Not Due, or is Reversed (with the reason); and when an incentive is paid.
49. **Manan is notified** when an employee resubmits a request — who, which request, when, and their justification.
50. Clicking a notice opens the request itself, or the Incentive Table, directly. A link only opens a request you are allowed to see.
51. Each person gets their own notice, and **never the same notice twice**. People who have left receive nothing.
52. The new notice types appear in the admin notification settings, and each employee can choose how they receive them in their own preferences.

### Emails

53. **Twelve new incentive emails**, all in the same design: New Incentive, Eligibility Removed, Incentive Updated, Incentive No Longer Available, Not Approved, Approved, Due, Paid, Resubmitted, Reversed, Revision Required and Published. ("Marked Not Due" appears in the app only, with no email.)
54. Reasons, notes and justifications appear in the email exactly as they were typed.
55. The old approve / reject email is no longer sent — these emails replace it.

### Other Screen Changes

56. The **Requests tab counter** now shows Manan how many requests are waiting for his review, and shows everyone else how many of their requests are still pending.
57. Opening a request from a notice takes you straight to the Requests tab with that request already open.

---

### Partially Completed / Not Done

- **Partially completed: Split Incentive.** The split is saved, shown on the request and used on the dashboard, but it does not divide the payment. Accounts still pays the way it did before.
- **Partially completed: Leads / Referrals.** Requests can be filed and reviewed, but they have no automatic amount (the chart pays per batch of leads or referrals), so an admin has to set the amount.
- **Not done: the Android phone app was not updated.** It cannot file incentive requests, split an incentive or resubmit one. It still lists your requests with the new status names, but the new statuses do not have their own colours in the app yet.
