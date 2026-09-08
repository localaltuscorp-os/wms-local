-- Employee performance criteria (Manan 2026-06). One editable text
-- field per employee, shown in Profile > Performance and Weekly Goals;
-- admin-editable. Seed is name-matched; idempotent (only sets when blank).
alter table employees add column if not exists performance_criteria text;

update employees set performance_criteria = 'Error free records, timely financial report, accuracy level, regulatory adherence' where performance_criteria is null and name ilike 'Dhanashree Solkar%';
update employees set performance_criteria = 'Error free records, timely financial report, accuracy level, regulatory adherence' where performance_criteria is null and name ilike 'Siddesh Walve%';
update employees set performance_criteria = 'Client satisfaction, quality of recommendations, timely delivery, revenue contribution' where performance_criteria is null and name ilike 'Rutvisha Mehta%';
update employees set performance_criteria = 'Client satisfaction, quality of recommendations, timely delivery, revenue contribution' where performance_criteria is null and name ilike 'Ruchita Ambre%';
update employees set performance_criteria = 'Client satisfaction, quality of recommendations, timely delivery, revenue contribution' where performance_criteria is null and name ilike 'Rohan Choudhary%';
update employees set performance_criteria = 'Client satisfaction, quality of recommendations, timely delivery, revenue contribution' where performance_criteria is null and name ilike 'Jeevan Bharambe%';
update employees set performance_criteria = 'Timely completion, error free work, resolution effectiveness, completeness & accuracy' where performance_criteria is null and name ilike 'Prakash Kumawat%';
update employees set performance_criteria = 'Timely completion, error free work, resolution effectiveness, completeness & accuracy' where performance_criteria is null and name ilike 'Sayyed Mohammad Daniyal%';
update employees set performance_criteria = 'Timely completion, error free work, resolution effectiveness, completeness & accuracy' where performance_criteria is null and name ilike 'Himanshu Lad%';
update employees set performance_criteria = '% of target achieved, conversion rate, client retention & satisfaction, timely & accurate reports' where performance_criteria is null and name ilike 'Satish Sonawane%';
update employees set performance_criteria = '% of target achieved, conversion rate, client retention & satisfaction, timely & accurate reports' where performance_criteria is null and name ilike 'Anand%';
update employees set performance_criteria = 'New clients acquired, quality of recommendations, problem solving effectiveness' where performance_criteria is null and name ilike 'Sanket Thorat%';
update employees set performance_criteria = 'New clients acquired, quality of recommendations, problem solving effectiveness' where performance_criteria is null and name ilike 'Kiran Bhosale%';
update employees set performance_criteria = 'Task accuracy, data quality, timeliness' where performance_criteria is null and name ilike 'Pukhraj Suthar%';
update employees set performance_criteria = 'Assigned work completion, adherence to standards, skill improvement, collaboration & responsiveness' where performance_criteria is null and name ilike 'Siddhi Lakade%';
update employees set performance_criteria = 'Assigned work completion, adherence to standards, skill improvement, collaboration & responsiveness' where performance_criteria is null and name ilike 'Dhruv Jhaveri%';
update employees set performance_criteria = 'Assigned work completion, adherence to standards, skill improvement, collaboration & responsiveness' where performance_criteria is null and name ilike 'Pratik Patil%';
update employees set performance_criteria = 'Task accuracy, data quality, timeliness, % of target achieved, conversion rate, client retention & satisfaction, learning progress' where performance_criteria is null and name ilike 'Proveeka Makwana%';
update employees set performance_criteria = '% of target achieved, conversion rate, client retention & satisfaction, quality of recommendations, revenue contribution' where performance_criteria is null and name ilike 'Mishtie Kanani%';
update employees set performance_criteria = 'Project completion on time, maintainability, performance, issue solving, speed & responsiveness' where performance_criteria is null and name ilike 'Hetesh Vichare%';
update employees set performance_criteria = 'Project completion on time, maintainability, performance, issue solving, speed & responsiveness' where performance_criteria is null and name ilike 'Shreya Shukla%';
update employees set performance_criteria = 'Project completion on time, maintainability, performance, issue solving, speed & responsiveness' where performance_criteria is null and name ilike 'Shreya Randhe%';
update employees set performance_criteria = 'Project completion on time, maintainability, performance, issue solving, speed & responsiveness' where performance_criteria is null and name ilike 'Hardik Bhutada%';
update employees set performance_criteria = 'Project completion on time, maintainability, performance, issue solving, speed & responsiveness' where performance_criteria is null and name ilike 'Krish Maheshwari%';
update employees set performance_criteria = 'Project completion on time, maintainability, performance, issue solving, speed & responsiveness' where performance_criteria is null and name ilike 'Suresh Yadav%';
update employees set performance_criteria = 'Campaign success rate, task accuracy, data quality, timeliness, learning progress' where performance_criteria is null and name ilike 'Kripsha Joshi%';
update employees set performance_criteria = 'Completion of assigned creative tasks, improvement in design & editing skills, responsiveness & communication' where performance_criteria is null and name ilike 'Pratham Medhekar%';
update employees set performance_criteria = 'Completion of assigned creative tasks, improvement in design & editing skills, responsiveness & communication' where performance_criteria is null and name ilike 'Atul Asthana%';
update employees set performance_criteria = 'Accuracy of screening, timeliness of coordination, quality of documentation, skill development progress, team responsiveness' where performance_criteria is null and name ilike 'Tanay Kaul%';
update employees set performance_criteria = 'Accuracy of research, timeliness of coordination, quality of documentation, innovation tracking effectiveness, team responsiveness' where performance_criteria is null and name ilike 'Yug Verma%';
