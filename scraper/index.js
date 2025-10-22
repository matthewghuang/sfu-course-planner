import ky from "ky";
import { PrismaClient } from "@prisma/client";

const BASE_URL = "http://www.sfu.ca/bin/wcm/course-outlines";

const prisma = new PrismaClient();

async function scrapeYears() {
	const years = await ky.get(BASE_URL).json();
	for (const year of years) {
		try {
			await prisma.year.create({
				data: {
					year: Number(year.text),
				},
			});
		} catch (error) {}
	}
}

async function scrapeTerms() {
	const years = await prisma.year.findMany();
	for (const year of years) {
		const yearNumber = year.year;

		const responseJson = await ky.get(BASE_URL + `?${yearNumber}`).json();

		for (const term of responseJson) {
			try {
				await prisma.term.create({
					data: {
						term: term.value,
						yearId: year.id,
					},
				});
			} catch (error) {
				if (error.code != "P2002") console.error(error);
			}
		}
	}
}

async function scrapeDepartments() {
	const terms = await prisma.term.findMany({
		include: {
			year: {
				select: {
					year: true,
				},
			},
		},
	});

	await terms.forEach(async (term) => {
		const termSeason = term.term;
		const year = term.year.year;

		const json = await ky.get(BASE_URL + `?${year}/${termSeason}`).json();

		json.forEach(async (department) => {
			const name = department.name ?? undefined;

			try {
				await prisma.department.create({
					data: {
						department: department.text,
						value: department.value,
						name: name,
						termId: term.id,
					},
				});
			} catch (error) {
				if (error.code != "P2002") console.log(error);
			}
		});
	});
}

async function scrapeCourseNumbers() {
	const departments = await prisma.department.findMany({
		include: {
			term: {
				include: {
					year: true,
				},
			},
		},
	});

	departments.forEach((department) => {
		const department = department.department;
		const term = department.term.term;
		const year = department.term.year.year;

		// console.log(term, year);
	});

	console.log(departments);
}

// await scrapeYears();
// await scrapeTerms();
// await scrapeDepartments();
await scrapeCourseNumbers();

/*[
  { text: '2014', value: '2014' },
  { text: '2015', value: '2015' },
  { text: '2016', value: '2016' },
  { text: '2017', value: '2017' },
  { text: '2018', value: '2018' },
  { text: '2019', value: '2019' },
  { text: '2020', value: '2020' },
  { text: '2021', value: '2021' },
  { text: '2022', value: '2022' },
  { text: '2023', value: '2023' },
  { text: '2024', value: '2024' },
  { text: '2025', value: '2025' },
  { text: '2026', value: '2026' }
]*/

// const terms = await ky.get(BASE_URL + "?2025").json();
// /*
// [
//   { text: 'FALL', value: 'fall' },
//   { text: 'SPRING', value: 'spring' },
//   { text: 'SUMMER', value: 'summer' }
// ]
// */
// console.log(terms);
