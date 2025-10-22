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
						termSeason: term.value,
						yearId: year.id,
					},
				});
			} catch (error) {}
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

	console.log(terms);
}

// await scrapeYears();
// await scrapeTerms();
await scrapeDepartments();

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
