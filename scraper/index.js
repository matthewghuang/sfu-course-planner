import ky from "ky";
import { PrismaClient } from "@prisma/client";

const BASE_URL = "http://www.sfu.ca/bin/wcm/course-outlines";

const prisma = new PrismaClient();

async function scrapeYears() {
	const years = await ky.get(BASE_URL).json();

	try {
		await prisma.year.createMany({
			data: Array.from(years),
		});
	} catch (error) {
		if (error.code == "P2002") {
			console.error(
				`Failed unique constraint on: ${error.meta.modelName}`
			);
		}
	}
}

async function scrapeTerms() {
	const years = await prisma.year.findMany();

	// console.log(years);
	years.forEach(async (year) => {
		const termResponse = await ky.get(BASE_URL + `?${year.value}`).json();
		const termData = Array.from(termResponse).map((term) => {
			return {
				...term,
				yearId: year.id,
			};
		});
		try {
			await prisma.term.createMany({
				data: termData,
			});
		} catch (error) {
			if (error.code == "P2002") {
				console.error(
					`Failed unique constraint on: ${error.meta.modelName}`,
					termData
				);
			}
		}
	});
}

async function scrapeDepartments() {
	const terms = await prisma.term.findMany({
		include: {
			year: true,
		},
	});

	terms.forEach(async (term) => {
		const year = term.year.value;

		const departmentResponse = await ky
			.get(BASE_URL + `?${year}/${term.value}`, {
				retry: {
					limit: 10,
					retryOnTimeout: true,
				},
			})
			.json();

		const departmentData = Array.from(departmentResponse).map(
			(department) => {
				return {
					...department,
					termId: term.id,
				};
			}
		);

		try {
			await prisma.department.createMany({
				data: departmentData,
			});
		} catch (error) {
			if (error.code == "P2002") {
				console.error(
					`Failed unique constraint on: ${error.meta.modelName}`,
					departmentData
				);
			}
		}
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

	departments.forEach(async (department) => {
		const term = department.term.value;
		const year = department.term.year.value;

		try {
			const courseNumberResponse = await ky
				.get(BASE_URL + `?${year}/${term}/${department.value}`, {
					retry: {
						limit: 10,
						retryOnTimeout: true,
					},
				})
				.json();

			const courseNumberData = Array.from(courseNumberResponse).map(
				(courseNumber) => {
					return {
						...courseNumber,
						departmentId: department.id,
					};
				}
			);

			try {
				await prisma.courseNumber.createMany({
					data: courseNumberData,
				});
			} catch (error) {
				if (error.code == "P2002") {
					console.error(
						`Failed unique constraint on: ${error.meta.modelName}`,
						courseNumberData
					);
				}
			}
		} catch (error) {
			console.error(error.response.status, department.value, term, year);
		}
	});
}

async function scrapeSections() {
	const courseNumbers = await prisma.courseNumber.findMany({
		where: {
			department: {
				term: {
					year: {
						value: "2014",
					},
				},
			},
		},
		include: {
			department: {
				include: {
					term: {
						include: {
							year: true,
						},
					},
				},
			},
		},
	});

	courseNumbers.forEach(async (courseNumber, i) => {
		const department = courseNumber.department;
		const term = courseNumber.department.term;
		const year = courseNumber.department.term.year;

		try {
			const url = `${BASE_URL}?${year.value}/${term.value}/${department.value}/${courseNumber.value}`;

			const sectionResponse = await ky
				.get(url, {
					retry: {
						limit: 15,
						retryOnTimeout: true,
					},
				})
				.json();

			// console.log(`scraping ${i + 1}/${courseNumbers.length} sections`);

			const sectionData = Array.from(sectionResponse).map((section) => {
				return {
					...section,
					courseNumberId: courseNumber.id,
				};
			});

			try {
				await prisma.section.createMany({
					data: sectionData,
				});
			} catch (error) {
				if (error.code == "P2002") {
					console.error(
						`Failed unique constraint on: ${error.meta.modelName}`,
						sectionData
					);
				} else {
					console.error(error);
				}
			}
		} catch (error) {
			console.error(
				error.response.status,
				courseNumber.value,
				department.value,
				term.value,
				year.value
			);
		}
	});
}

async function scrapeCourseOutlines() {
	const sections = await prisma.section.findMany({
		where: {
			courseNumber: {
				department: {
					term: {
						year: {
							value: "2025",
						},
					},
				},
			},
		},
		include: {
			courseNumber: {
				include: {
					department: {
						include: {
							term: {
								include: {
									year: true,
								},
							},
						},
					},
				},
			},
		},
	});

	sections.forEach(async (section) => {
		const courseNumber = section.courseNumber;
		const department = courseNumber.department;
		const term = courseNumber.department.term;
		const year = courseNumber.department.term.year;

		try {
			const url = `${BASE_URL}?${year.value}/${term.value}/${department.value}/${courseNumber.value}/${section.value}`;

			const courseOutlineResponse = await ky
				.get(url, {
					retry: {
						limit: 15,
						retryOnTimeout: true,
					},
				})
				.json();

			// console.log(`scraping ${i + 1}/${courseNumbers.length} sections`);

			const data = {
				...courseOutlineResponse.info,
				instructors: courseOutlineResponse.instructors,
				courseSchedule: courseOutlineResponse.courseSchedule,
				grades: courseOutlineResponse.grades,
				requiredTexts: courseOutlineResponse.requiredTexts,
				sectionId: section.id,
			};

			try {
				await prisma.courseOutline.create({
					data: data,
				});
			} catch (error) {
				if (error.code == "P2002") {
					console.error(
						`Failed unique constraint on: ${error.meta.modelName}`
						// data
					);
				} else {
					console.error(error);
				}
			}
		} catch (error) {
			console.error(
				error.response?.status,
				error,
				courseNumber.value,
				department.value,
				term.value,
				year.value
			);
		}
	});
}

async function getRegistrationOutlines() {
	const departmentsObj = await ky.get(`${BASE_URL}?2026/spring`).json();

	departmentsObj.forEach(async (dept) => {
		try {
			const courseNumbersObj = await ky
				.get(`${BASE_URL}?2026/spring/${dept.value}`)
				.json();

			courseNumbersObj.forEach(async (course) => {
				try {
					const sectionsObj = await ky
						.get(
							`${BASE_URL}?2026/spring/${dept.value}/${course.value}`
						)
						.json();

					sectionsObj.forEach(async (section) => {
						try {
							const outlineObj = await ky
								.get(
									`${BASE_URL}?2026/spring/${dept.value}/${course.value}/${section.value}`,
									{
										retry: {
											retryOnTimeout: true,
											limit: 10,
										},
									}
								)
								.json();

							await prisma.courseOutline.create({
								data: {
									info: {
										create: outlineObj["info"],
									},
									instructor: {
										createMany: {
											data:
												outlineObj["instructor"] ?? [],
										},
									},
									courseSchedule: {
										createMany: {
											data:
												outlineObj["courseSchedule"] ??
												[],
										},
									},
									grade: {
										createMany: {
											data: outlineObj["grades"] ?? [],
										},
									},
									requiredText: {
										createMany: {
											data:
												outlineObj["requiredText"] ??
												[],
										},
									},
								},
							});
						} catch (error) {
							console.error(error);
						}
					});
				} catch (error) {}
			});
		} catch (error) {}
	});
}

await getRegistrationOutlines();

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
