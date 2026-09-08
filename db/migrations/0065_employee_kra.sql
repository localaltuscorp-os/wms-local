-- Employee Key Result Areas (Manan 2026-06). The "what we measure" companion
-- to performance_criteria ("how we measure it"); both feed the Star of the
-- Month evaluation. Source: the org KRA/Criteria sheet. Admin-editable.
-- Name-matched + idempotent (only sets when blank). Typos from the sheet are
-- cleaned to match the 0061 criteria style.
alter table employees add column if not exists kra text;

update employees set kra = 'Financial accuracy, compliance, reporting of accounts, budget control' where kra is null and name ilike 'Dhanashree Solkar%';
update employees set kra = 'Financial accuracy, compliance, reporting of accounts, budget control' where kra is null and name ilike 'Siddesh Walve%';
update employees set kra = 'Client management, solution delivery, project completion, business growth' where kra is null and name ilike 'Rutvisha Mehta%';
update employees set kra = 'Client management, solution delivery, project completion, business growth' where kra is null and name ilike 'Ruchita Ambre%';
update employees set kra = 'Client management, solution delivery, project completion, business growth' where kra is null and name ilike 'Rohan Choudhary%';
update employees set kra = 'Client management, solution delivery, project completion, business growth' where kra is null and name ilike 'Jeevan Bharamb%';
update employees set kra = 'Project delivery, technical quality, problem solving, data analysis and reporting' where kra is null and name ilike 'Prakash Kumawat%';
update employees set kra = 'Project delivery, technical quality, problem solving' where kra is null and name ilike 'Sayyed Mohammad Daniyal%';
update employees set kra = 'Project delivery, technical quality, problem solving' where kra is null and name ilike 'Himanshu Lad%';
update employees set kra = 'Sales target achievement, lead conversion, client management, reporting' where kra is null and name ilike 'Satish Sonawane%';
update employees set kra = 'Sales target achievement, lead conversion, client management, reporting' where kra is null and name ilike 'Anand%';
update employees set kra = 'Client acquisition, business analysis, business development, team collaboration' where kra is null and name ilike 'Sanket Thorat%';
update employees set kra = 'Client acquisition, business analysis, business development, team collaboration' where kra is null and name ilike 'Kiran Bhosale%';
update employees set kra = 'Operational support, data management, learning' where kra is null and name ilike 'Pukhraj Suthar%';
update employees set kra = 'Task execution, code & technical quality, learning, team support' where kra is null and name ilike 'Siddhi Lakade%';
update employees set kra = 'Task execution, code & technical quality, learning, team support' where kra is null and name ilike 'Dhruv Jhaveri%';
update employees set kra = 'Task execution, code & technical quality, learning, team support' where kra is null and name ilike 'Pratik Patil%';
update employees set kra = 'Operational support, data management, sales target achievement, lead conversion, client management, learning' where kra is null and name ilike 'Proveeka Makwana%';
update employees set kra = 'Sales target achievement, lead conversion, client management, solution delivery, project completion, business growth' where kra is null and name ilike 'Mishtie Kanani%';
update employees set kra = 'Website development learning, code quality, bug resolution, website performance' where kra is null and name ilike 'Hetesh Vich%';
update employees set kra = 'Website development learning, code quality, bug resolution, website performance' where kra is null and name ilike 'Shreya Shukla%';
update employees set kra = 'Website development learning, code quality, bug resolution, website performance' where kra is null and name ilike 'Shreya Randhe%';
update employees set kra = 'Website development learning, code quality, bug resolution, website performance' where kra is null and name ilike 'Hardik Bhutada%';
update employees set kra = 'Website development learning, code quality, bug resolution, website performance' where kra is null and name ilike 'Krish Maheshwari%';
update employees set kra = 'Website development learning, code quality, bug resolution, website performance' where kra is null and name ilike 'Suresh Yadav%';
update employees set kra = 'Marketing support, campaign execution, operational assistance, data management, learning' where kra is null and name ilike 'Kripsha Joshi%';
update employees set kra = 'Design & editing support, content production, learning & skill development, team collaboration' where kra is null and name ilike 'Pratham Medhekar%';
update employees set kra = 'Design & editing support, content production, learning & skill development, team collaboration' where kra is null and name ilike 'Atul Asthana%';
update employees set kra = 'Interview coordination, candidate screening, documentation support, learning & skill development, team collaboration' where kra is null and name ilike 'Tanay Kaul%';
update employees set kra = 'Research coordination, project documentation support, innovation tracking, learning & skill development, team collaboration' where kra is null and name ilike 'Yug Verma%';
