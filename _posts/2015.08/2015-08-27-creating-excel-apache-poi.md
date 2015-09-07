---
layout: post
title:  'Creating charts in Excel using Apache POI'
date:   2015-08-27 15:15:00
tags: ['java', 'apache poi']
category: detail
excerpt: A tutorial on exporting Excel files with charts using Apache POI.
---

I just had to do something at work that I already knew I was going to hate: export some data to an Excel file and the file should also contain a chart based on that data. I knew I was going to hate this because I've worked on manipulating Excel files from Java before and it's not easy. The good news is I figured it out and managed to keep my sanity.

The first test
---

I've used [Apache POI](https://poi.apache.org/) (version 3.11-beta2), as far as I was able to find it's the only free option for manipulating Excel files from Java. Here are the maven dependencies:

~~~ xml
<dependency>
    <groupId>org.apache.poi</groupId>
    <artifactId>poi</artifactId>
    <version>3.11-beta2</version>
</dependency>
<dependency>
    <groupId>org.apache.poi</groupId>
    <artifactId>poi-ooxml</artifactId>
    <version>3.11-beta2</version>
</dependency>
~~~

Writing data to an excel file, with multiple sheets, is easy enough. I've quickly set up a test to verify this:

~~~ java
@Test
public void exportTwoSheets() throws Exception {
    HSSFWorkbook workbook = new HSSFWorkbook();

    HSSFSheet sheet1 = workbook.createSheet("sheet name 1");
    writeToSheet(mockStringData(), sheet1);

    HSSFSheet sheet2 = workbook.createSheet("sheet name 2");
    writeToSheet(mockStringData(), sheet2);

    File file = new File("testTwoSheets.xls");
    FileOutputStream fileOutputStream = new FileOutputStream(file);
    workbook.write(fileOutputStream);
    fileOutputStream.close();
}

private List<List<String>> mockStringData() {
    List<List<String>> data = new ArrayList<List<String>>();
    data.add(Arrays.asList(new String[] {"column 1", "column 2", "column 3"}));
    data.add(Arrays.asList(new String[] {"value 1 1", "value 1 2", "value 1 3"}));
    data.add(Arrays.asList(new String[] {"value 2 1", "value 2 2", "value 2 3"}));
    data.add(Arrays.asList(new String[] {"value 3 1", "value 3 2", "value 3 3"}));
    return data;
}
~~~

I'll also add this here for future reference, a test that exports an excel sheet with a function:

~~~ java
@Test
public void exportFunction() throws Exception {
    HSSFWorkbook workbook = new HSSFWorkbook();

    HSSFSheet sheet = workbook.createSheet();

    String[] names = new String[] {"name1", "name2", "name3"};
    Integer[] values = new Integer[] {1, 2, 3};

    for (int index = 0; index < names.length; index++) {
        HSSFRow row = sheet.createRow(index);
        HSSFCell nameCell = row.createCell(0);
        nameCell.setCellType(Cell.CELL_TYPE_STRING);
        nameCell.setCellValue(names[index]);

        HSSFCell valueCell = row.createCell(1);
        valueCell.setCellType(Cell.CELL_TYPE_NUMERIC);
        valueCell.setCellValue(values[index]);
    }

    HSSFRow formulaRow = sheet.createRow(names.length);
    HSSFCell formulaCell = formulaRow.createCell(1);
    formulaCell.setCellValue(Cell.CELL_TYPE_FORMULA);
    formulaCell.setCellFormula("SUM(B1:B3)");

    File file = new File("testFormula.xls");
    FileOutputStream fileOutputStream = new FileOutputStream(file);
    workbook.write(fileOutputStream);
    fileOutputStream.close();
}
~~~

And now, for something completely more complicated
---

Next I had to create a chart based on the data I am writing to the excel file. I've read around a bit and the following three were my options:

1. create chart with Apache POI;
2. use some other library to create an image of a chart and insert it into the Excel file;
3. create a template Excel file that contains a chart, then use Apache POI to fill the template with data.

The first one sounded like the most elegant option. Apache POI supports chart creation, as long as it is a line ([see how to create a line chart with Apache POI](https://svn.apache.org/repos/asf/poi/trunk/src/examples/src/org/apache/poi/xssf/usermodel/examples/LineChart.java)) or a scatter chart ([see how to create a scatter chart with Apache POI](https://svn.apache.org/repos/asf/poi/trunk/src/examples/src/org/apache/poi/xssf/usermodel/examples/ScatterChart.java)). But I wanted to create a bar chart. Exactly...

The second option I did not even explore. There are resources on how to do that, but if you're doing that there is no point of exporting an Excel file, you can just export the data and the chart in a PDF. The Excel file is dynamic, you send it to your users and they can modify the data and see how different values would affect the chart. I moved on to the third option.

Excel templates
---

To make the template approach work, we need to go through the following steps:

- define your table, the headers followed by data;
- define a chart that can dynamically use the data in the table.

A very elegant way to do this would be to use the table feature in Excel ([create dynamic charts in Excel using the table feature](http://www.techrepublic.com/blog/microsoft-office/two-ways-to-build-dynamic-charts-in-excel/)). That doesn't work in Apache POI. Opening the template file with Apache POI will break the table feature and the chart based on the table. You can insert your data, but neither the table nor the chart will be updated.

What is left is using dynamic series ([create dynamic charts in Excel using dynamic series](http://www.techrepublic.com/blog/microsoft-office/two-ways-to-build-dynamic-charts-in-excel/)). I'll walk you through the steps of making this work in the tutorial section.

Tutorial
---

First, create your file and the structure of you data sheet. Enter the name of the sheet, then write a title and your table header.

<p class="image"><img src="/assets/2015.08/apachepoi001.png" alt="Create Excel file and column headers"/></p>

Enter some dummy data.

<p class="image"><img src="/assets/2015.08/apachepoi002.png" alt="Enter dummy data in the Excel file"/></p>

Define the dynamic series you are going to use in the chart (go to Formulas, Name Manager).

<p class="image">
    <img src="/assets/2015.08/apachepoi003.png" alt="Open name manager"/>
    <img src="/assets/2015.08/apachepoi004.png" alt="Create new series"/>
    <img src="/assets/2015.08/apachepoi005.png" alt="Fill out series name and formula"/>
</p>

The formulas are (the difference is because the title gets counted for column A):

~~~
labelRange=OFFSET(datasheet!$A$4,0,0,COUNTA(datasheet!$A:$A)-2)
valueRange=OFFSET(datasheet!$B$4,0,0,COUNTA(datasheet!$B:$B)-1)
~~~

Verify the formulas are good.

<p class="image"><img src="/assets/2015.08/apachepoi006.png" alt="Verify formulas refer to correct cells" /></p>

Create a chart based on your data.

<p class="image">
    <img src="/assets/2015.08/apachepoi007.png" alt="Create a new chart"/>
    <img src="/assets/2015.08/apachepoi008.png" alt="Verify labels and data are correctly displayed in chart"/>
</p>

Replace chart data with dynamic series names.

<p class="image">
    <img src="/assets/2015.08/apachepoi009.png" alt="Open chart definition window"/>
    <img src="/assets/2015.08/apachepoi010.png" alt="Select values data range and click edit"/>
    <img src="/assets/2015.08/apachepoi011.png" alt="Replace data range with name of values dynamic series"/>
    <img src="/assets/2015.08/apachepoi012.png" alt="Replace data range with name of values dynamic series"/>
    <img src="/assets/2015.08/apachepoi013.png" alt="Select labels data tange and click edit"/>
    <img src="/assets/2015.08/apachepoi014.png" alt="Replace labels data range with name of labels dynamic series"/>
</p>

When you add new labels and values, they should show up in the chart.

<p class="image"><img src="/assets/2015.08/apachepoi015.png" alt="Verify that chart is updated when adding new values to the table"/></p>

Move the chart to a separate sheet.

<p class="image">
    <img src="/assets/2015.08/apachepoi016.png" alt="Right-click chart and select Move Chart"/>
    <img src="/assets/2015.08/apachepoi017.png" alt="Select new sheet and fill out name"/>
    <img src="/assets/2015.08/apachepoi018.png" alt="Verify chart was moved to new sheet"/>
</p>

Remove dummy data.

<p class="image"><img src="/assets/2015.08/apachepoi019.png" alt="Remove dummy data"/></p>

Save the template.

The java code that writes data in the template:

~~~ java
@Test
public void writeSimpleTemplate() throws Exception {
    XSSFWorkbook wb = new XSSFWorkbook(OPCPackage.open("simpleTemplate.xlsx"));
    XSSFSheet sheet = wb.getSheetAt(0);

    sheet.createRow(3).createCell(0).setCellValue((new Date()).toString());
    sheet.getRow(3).createCell(1).setCellValue(1);

    sheet.createRow(4).createCell(0).setCellValue((new Date()).toString());
    sheet.getRow(4).createCell(1).setCellValue(3);

    sheet.createRow(5).createCell(0).setCellValue((new Date()).toString());
    sheet.getRow(5).createCell(1).setCellValue(8);

    FileOutputStream fileOut = new FileOutputStream("testSimpleTemplate.xlsx");
    wb.write(fileOut);
    fileOut.close();
}
~~~

The result.

<p class="image">
    <img src="/assets/2015.08/apachepoi020.png" alt="Verify data was written to the table"/>
    <img src="/assets/2015.08/apachepoi021.png" alt="Verify chart was updated to reflect new data"/>
</p>
