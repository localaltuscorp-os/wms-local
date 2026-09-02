-- Index hub (Manan 2026-06) — the Altus Corp Ecosystem Index, brought into
-- the app as an editable tab. Two tables: sections and the hyperlink buttons
-- under them. Admins can add/remove both from the UI; everyone can view.
-- Idempotent: create-if-not-exists + a one-time seed guarded by NOT EXISTS.

create table if not exists index_sections (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists index_links (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references index_sections(id) on delete cascade,
  label       text not null,
  url         text not null,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists index_links_section_idx on index_links (section_id, sort_order);

-- One-time seed from the original Ecosystem Index page. Skipped if any
-- section already exists (so admin edits are never overwritten on re-run).
do $$
declare sid uuid;
begin
  if not exists (select 1 from index_sections) then
    insert into index_sections (title, sort_order) values ('Manan Vasa', 10) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Monthly Events Master', 'https://docs.google.com/spreadsheets/d/1_jqOrmr1uKJUUIYI6PgFwPD3ar2iSsSN9OPgRhZixjE/edit?gid=1385577646#gid=1385577646', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Daily Compliance', 'https://docs.google.com/spreadsheets/d/1YjuNom1QX43O9X4GbQoF_fER0siolfR_V8czbextMtU/edit?gid=84864476#gid=84864476', 20);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Eco System MIS', 'https://docs.google.com/spreadsheets/d/1hyis3vFOv66-pZT7w9GDPjfyle_dPm1q5_6zitZOC0Y/edit?gid=1961710783#gid=1961710783', 30);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Work to Employees', 'https://docs.google.com/spreadsheets/d/1AaWqlMMfziX9X22FfMRbwXKaTpHNzULXq7_KOMYZGpg/edit?gid=406188658#gid=406188658', 40);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Work to Interns', 'https://docs.google.com/spreadsheets/d/1Bu7SL7z-xVn_uoct_mvgc5mhcwp57pz6Riy-lSXfP5Q/edit?gid=1905642013#gid=1905642013', 50);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Projects', 'https://docs.google.com/spreadsheets/d/1QJJKDoD0i8dZA4kxhLuwlm8LVqGgMpyvfbW1Ljeuf8Q/edit?resourcekey=&gid=128551182#gid=128551182', 60);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'SP-1 Angad Raj', 'https://docs.google.com/spreadsheets/d/1vEjBB3HZQmrA_LVpQqoNuAfHeOw_py26Dk_b8aBOyoA/edit?gid=1958275664#gid=1958275664', 70);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'SP-2', 'https://docs.google.com/spreadsheets/d/1dTqZEqBK2_saqPBVebctu-ewjGT4XYK3e8wneYkGCUo/edit', 80);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Corp Marketing Master Plan', 'https://docs.google.com/spreadsheets/d/1dvJ4A3rv-fqgTtiOmz-FE0oeFOt1y6-4_R0Wmo3OqL4/edit', 90);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Corp Marketing Index', 'https://docs.google.com/spreadsheets/d/1KRmHMVTdVjoMGblEOxQtpl-OXR2lughdWQyZ3rK5bZk/edit', 100);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Outstanding Tracker', 'https://docs.google.com/spreadsheets/d/1prOH_hXW3hXU0pw-GGzo5oItGDk0vDeXdyz2b5zRQEc/edit', 110);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Corp Communication Channels', 'https://docs.google.com/spreadsheets/d/1eeU3xV6v9vQiH6maNwdoFiE7IxSVG8mG-HTjoH1AfQ8/edit', 120);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Salary Sheet', 'https://docs.google.com/spreadsheets/d/1vnWreY50zWwQOxU1fck0J_aeAuV_OZ9NEtbhqxPvOj8/edit?usp=sharing', 130);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Bank Details To Collect Money', 'https://docs.google.com/document/d/1bNjBA9sJ1Nv5oLonGwdpvsBkyG6HIJrjV48ODUP0f9s/edit?tab=t.0', 140);
    insert into index_sections (title, sort_order) values ('Employees', 20) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Employee Dashboard', 'https://docs.google.com/spreadsheets/d/1AaWqlMMfziX9X22FfMRbwXKaTpHNzULXq7_KOMYZGpg/edit?gid=1905642013#gid=1905642013', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Intern Dashboard', 'https://docs.google.com/spreadsheets/d/1Bu7SL7z-xVn_uoct_mvgc5mhcwp57pz6Riy-lSXfP5Q/edit?gid=1905642013#gid=1905642013', 20);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Incentive Chart', 'https://docs.google.com/spreadsheets/d/1hyis3vFOv66-pZT7w9GDPjfyle_dPm1q5_6zitZOC0Y/edit?gid=729848867#gid=729848867', 30);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Corp Eco System Responses', 'https://docs.google.com/spreadsheets/d/1qnVWsgxGZbBRsB_8OJ-_KwsHoZYU3pkTIRdHTjM0kW8/edit?gid=1080548109#gid=1080548109', 40);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Eco System Index', 'https://docs.google.com/spreadsheets/d/1YjuNom1QX43O9X4GbQoF_fER0siolfR_V8czbextMtU/edit?gid=2031382697#gid=2031382697', 50);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Corp Employee Onboarding', 'https://forms.gle/6w3kog71UuUT5wzr8', 60);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Walk In Form', 'https://forms.gle/5t8CrcRCZWw8636u7', 70);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Candidate Evaluation Checklist', 'https://docs.google.com/spreadsheets/d/1XM5l3DUJlu3j0vo_AbRVVtYH8WD2LyJwmQCNJG6CrjQ/edit', 80);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Altus Corp Passwords', 'https://docs.google.com/spreadsheets/d/1wWaVATwfkFmjBYIZlaNIR_KSGufGaDBg-yyMgRwdpHE/edit?gid=0#gid=0', 90);
    insert into index_sections (title, sort_order) values ('Sales', 30) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, '2026 Qualified Leads Master', 'https://docs.google.com/spreadsheets/d/18tS_p6mLg0WbvaueP-kait2JqUvcAqHnQBCpzYcSKhg/edit?gid=0#gid=0', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'SP1 - Angad Reference Calling', 'https://docs.google.com/spreadsheets/d/1vEjBB3HZQmrA_LVpQqoNuAfHeOw_py26Dk_b8aBOyoA/edit?gid=1958275664#gid=1958275664', 20);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'SP2 Reference Calling', 'https://docs.google.com/spreadsheets/d/1dTqZEqBK2_saqPBVebctu-ewjGT4XYK3e8wneYkGCUo/edit', 30);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Pre PSO - SP1 Angad', 'https://docs.google.com/spreadsheets/d/1vEjBB3HZQmrA_LVpQqoNuAfHeOw_py26Dk_b8aBOyoA/edit?gid=2011413326#gid=2011413326', 40);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Pre PSO - SP2', 'https://docs.google.com/spreadsheets/d/1dTqZEqBK2_saqPBVebctu-ewjGT4XYK3e8wneYkGCUo/edit?gid=2011413326#gid=2011413326', 50);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PS Registration - SP1 Angad', 'https://docs.google.com/spreadsheets/d/1vEjBB3HZQmrA_LVpQqoNuAfHeOw_py26Dk_b8aBOyoA/edit?gid=1433215372#gid=1433215372', 60);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PS Registration - SP2', 'https://docs.google.com/spreadsheets/d/1dTqZEqBK2_saqPBVebctu-ewjGT4XYK3e8wneYkGCUo/edit?gid=1433215372#gid=1433215372', 70);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Bank Details to Collect Money', 'https://docs.google.com/document/d/1bNjBA9sJ1Nv5oLonGwdpvsBkyG6HIJrjV48ODUP0f9s/edit?tab=t.0', 80);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PSO Folder', 'https://drive.google.com/drive/folders/1mhICZPww-w7lnLBnWl70XRdfNSTijEr_?usp=drive_link', 90);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PS Billing Form', 'https://forms.gle/1hvzwf2ZzYLcguH3A', 100);
    insert into index_sections (title, sort_order) values ('Consulting Folders', 40) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Aria Aerial', 'https://drive.google.com/drive/folders/10_BMMlpBx4aFrPLzRSdCiHXplVUt9vzd?usp=drive_link', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Arihant', 'https://drive.google.com/drive/folders/1KZuSBVjMHVbpM8aYQWhns-b8kwZOzkIy?usp=drive_link', 20);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'CTL', 'https://drive.google.com/drive/folders/1US9P34CDWyjkrtOyJTQiadkyoEGKvmfc?usp=drive_link', 30);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Crish Metal Works', 'https://drive.google.com/drive/folders/1bumScnf0wA5VzRunb4byFkJwiMfoTt8y?usp=drive_link', 40);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Kangaroo', 'https://drive.google.com/drive/folders/1nBY5rWECERhjiIziOOK6ghPyT1J664Bt?usp=drive_link', 50);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Ennoble', 'https://drive.google.com/drive/folders/1pMj0bqxWxnHvEoV1PbdPwLugfw5r_wsT?usp=drive_link', 60);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Heel Your Sole', 'https://drive.google.com/drive/folders/1spanO9ZuWESA5p4dpGn9BzU73f9udYws?usp=drive_link', 70);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Niaa', 'https://drive.google.com/drive/folders/152hEU_LXc0EqMKMQeFU-kePh9ZNYiYKC?usp=drive_link', 80);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Nirman Corp', 'https://drive.google.com/drive/folders/1onie7y9Iff90ZeQ9hyb8asPf0ghEaIC1?usp=drive_link', 90);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Sattva Logistics', 'https://drive.google.com/drive/folders/1CPMUB8fAtWOfxMwuXrtrzWPJvcFgdCIz?usp=drive_link', 100);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Stellary', 'https://drive.google.com/drive/folders/1dMtg8e2U5Zm6KCHfNvCIhPrLrYQ4HfSV?usp=drive_link', 110);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Sukhsons', 'https://drive.google.com/drive/folders/18yOBMX7B3Wsus6kGM-BMklxgRcezE_5D?usp=drive_link', 120);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Tranquil', 'https://drive.google.com/drive/folders/1W5bqK61PjFP4QQIeklE0pJvquxO-UIJt?usp=drive_link', 130);
    insert into index_sections (title, sort_order) values ('Marketing', 50) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Participant Video Master', 'https://drive.google.com/drive/folders/1_yt90i9zFLSYF0ida-CqwklwKZwhMgZt?usp=drive_link', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Participant LinkedIn Master', 'https://drive.google.com/drive/folders/11a1qw5H9vqvgMXAClfHMSUh6Nr3kxbxR?usp=drive_link', 20);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'All Entities Logo', 'https://drive.google.com/drive/folders/1OyadpVUEJAaos8QKjgeQG_yMhBn42fhE?usp=drive_link', 30);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PSO Invites', 'https://drive.google.com/drive/folders/1BaTStn2bdJpQvsVIA3-xKaxTOLqox9Bp?usp=drive_link', 40);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Marketing Calendar', 'https://docs.google.com/spreadsheets/d/1sAYTXAWnGbAR2AHyKH_TJk62jeph8tJ3HZOAC2Gl0zw/edit?gid=1065497428#gid=1065497428', 50);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Workshop Schedule', 'https://docs.google.com/presentation/d/1-LVVRgg7ylJGWby4ED-xcop7zw5AuIYF/edit?slide=id.p1#slide=id.p1', 60);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'WhatsApp Group To Post', 'https://docs.google.com/spreadsheets/d/1RmvPu0I-ywWB_k9XKQetFGv3zoiI_ENlKJlnCKCLhMo/edit', 70);
    insert into index_sections (title, sort_order) values ('Accounts', 60) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Accounts Totality Master 2026', 'https://docs.google.com/spreadsheets/d/1bN6ycsR8SwJDhSOPwzEau10MUqWFXiDB5zULAqN3hPM/edit?usp=sharing', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'Accounts Induction Manual', 'https://docs.google.com/document/d/1XpKEyRhi6yMk5VKCCAm7w8LboMH0dO28S8DrmdN4zgo/edit?usp=sharing', 20);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PS Billing Form', 'https://forms.gle/1hvzwf2ZzYLcguH3A', 30);
    insert into index_sections (title, sort_order) values ('Participants', 70) returning id into sid;
    insert into index_links (section_id, label, url, sort_order) values (sid, 'BSS Folder', 'https://drive.google.com/drive/folders/1-4ksw6yo_Kl0I_Ed84ZBClOv-fuf9DfL?usp=drive_link', 10);
    insert into index_links (section_id, label, url, sort_order) values (sid, 'PS Folder', 'https://drive.google.com/drive/folders/17pb75_AtTd2dHgUj99y2QYIpXMd0R1AB?usp=drive_link', 20);
  end if;
end $$;
