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
	for (const yearObj of years) {
		const yearNumber = yearObj.year;

		const responseJson = await ky.get(BASE_URL + `?${yearNumber}`).json();

		for (const term of responseJson) {
			try {
				await prisma.term.create({
					data: {
						term: term.value,
						year: yearNumber,
					},
				});
			} catch (error) {
				if (error.code != "P2002") console.error(error);
			}
		}
	}
}

async function scrapeDepartments() {
	const terms = await prisma.term.findMany();

	await terms.forEach(async (termObj) => {
		const term = termObj.term;
		const year = termObj.year;

		const responseJson = await ky
			.get(BASE_URL + `?${year}/${term}`, {
				retry: {
					retryOnTimeout: true,
				},
			})
			.json();

		responseJson.forEach(async (department) => {
			const name = department.name ?? undefined;

			try {
				await prisma.department.create({
					data: {
						department: department.text,
						value: department.value,
						name: name,
						term: term,
						year: year,
					},
				});
			} catch (error) {
				if (error.code != "P2002") console.error(error);
			}
		});
	});
}

async function scrapeCourseNumbers() {
	const departments = await prisma.department.findMany();

	departments.forEach(async (departmentObj) => {
		const department = departmentObj.department;
		const term = departmentObj.term;
		const year = departmentObj.year;

		try {
			const responseJson = await ky
				.get(BASE_URL + `?${year}/${term}/${department}`, {
					retry: {
						retryOnTimeout: true,
					},
				})
				.json();

			// modify it to include foreign key data and alter "text" field to be more descriptive
			const alteredData = Array.from(responseJson).map((obj) => {
				return {
					courseNumber: obj.text,
					value: obj.value,
					title: obj.title ?? "",
					department: department,
					term: term,
					year: year,
				};
			});

			try {
				await prisma.courseNumber.createMany({
					data: alteredData,
				});
			} catch (error) {
				if (error.code != "P2002") console.error(error);
			}
		} catch (error) {
			if (error.response.status != 404) console.error(error);
		}
	});
}

async function scrapeSections() {
	// const courseNumbers = await prisma.courseNumber.findMany({
	// 	where: {
	// 		year: 2022,
	// 		OR: {
	// 			year: 2023,
	// 		},
	// 	},
	// });

	const courseNumbers =
		await prisma.$queryRaw`SELECT * FROM CourseNumber WHERE year BETWEEN 2022 AND 2026`;

	courseNumbers.forEach(async (courseNumberObj) => {
		const courseNumber = courseNumberObj.courseNumber;
		const department = courseNumberObj.department;
		const term = courseNumberObj.term;
		const year = courseNumberObj.year;

		try {
			const responseJson = await ky
				.get(
					BASE_URL + `?${year}/${term}/${department}/${courseNumber}`,
					{
						retry: {
							limit: 10,
							retryOnTimeout: true,
						},
					}
				)
				.json();

			// modify it to include foreign key data and alter "text" field to be more descriptive
			const alteredData = Array.from(responseJson).map((obj) => {
				return {
					section: obj.text,
					value: obj.value,
					title: obj.title ?? "",
					classType: obj.classType,
					sectionCode: obj.sectionCode,
					associatedClass: obj.associatedClass,
					courseNumber: courseNumber,
					department: department,
					term: term,
					year: year,
				};
			});

			try {
				await prisma.section.createMany({
					data: alteredData,
				});
			} catch (error) {
				if (error.code != "P2002") console.error(error);
			}
		} catch (error) {
			if (error.response?.status != 404) console.error(error);
		}
	});
}

async function scrapeCourseOutlines() {
	const sections = await prisma.section.findMany({
		where: {
			year: 2014,
		},
	});

	sections.forEach(async (sectionObj) => {
		const section = sectionObj.section;
		const courseNumber = sectionObj.courseNumber;
		const department = sectionObj.department;
		const term = sectionObj.term;
		const year = sectionObj.year;

		try {
			const responseJson = await ky
				.get(
					BASE_URL +
						`?${year}/${term}/${department}/${courseNumber}/${section}`,
					{
						retry: {
							limit: 10,
							retryOnTimeout: true,
						},
					}
				)
				.json();

			const alteredData = {
				...responseJson.info,
				courseNumber: courseNumber,
				department: department,
				termStr: term,
				year: year,
			};

			try {
				await prisma.courseOutline.createMany({
					data: alteredData,
				});
			} catch (error) {
				if (error.code != "P2002") console.error(error);
			}
		} catch (error) {
			if (error.response?.status != 404) console.error(error);
		}
	});
}

// await scrapeYears();
// await scrapeTerms();
// await scrapeDepartments();
// await scrapeCourseNumbers();
// await scrapeSections();
await scrapeCourseOutlines();

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
