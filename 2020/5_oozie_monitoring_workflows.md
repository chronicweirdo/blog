A configurable spark job for filtering and detecting 
when new data arrives

A spark job thet detects when new data is no longer
arriving

A complex oozie job to monitor for multiple
conditions and email with relevant information

# Oozie Monitoring Workflows

In our current big data system we load data from many devices with very different configurations. When a new device configuration becomes known to us, we prepare adapt our jobs as well as possible in preparation for the new data, but no amount of preparation can account for possible changes in the setup that we were not expecting. Because we have so much variation and so many things can go wrong, it is impossible for a person to keep an eye on all the data we load. This means we need to automate the process. In this article, I will present a more complex Oozie workflow that can run some configurable Spark jobs designed to identify specific conditions in our data and notify us by email if those conditions are met.

## Spark Filter and Check

This will be a simple but powerful Spark job that will load data from a configurable location containing Parquet files, filter that data based on a configurable array of filters and values, then count the remaining data entries. If the count is larger than a configurable amount, the job triggers the notification.

``` scala
package com.cacoveanu.spark.monitoring

import java.net.URLDecoder

import com.cacoveanu.spark.ArgmapConfiguration
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions.col

object FilterCheck {

  def main(args: Array[String]): Unit = {
    val argmapConfiguration = new ArgmapConfiguration(args)

    val local = argmapConfiguration.getOrElse("local", false)
    val inputLocation = argmapConfiguration.getOrElse("input_location","hdfs://data/raw")
    val greaterThan = argmapConfiguration.getOrElse("greater_than", 0)
    val filters = argmapConfiguration.keys().diff(Set("input_location", "greater_than", "local"))

    implicit val spark: SparkSession = (if (local) SparkSession.builder().master("local[*]") else SparkSession.builder())
      .config("spark.sql.streaming.schemaInference", true)
      .config("spark.default.parallelism", 8)
      .config("spark.sql.shuffle.partitions", 12)
      .getOrCreate()

    var monitoredData = spark.read.parquet(inputLocation)

    for (filter <- filters) {
      val expectedValues: Seq[String] = argmapConfiguration.getList(filter, "").map(s => URLDecoder.decode(s, "UTF-8"))
      if (expectedValues.nonEmpty) {
        monitoredData = monitoredData.filter(col(filter).isin(expectedValues:_*))
      }
    }

    val count: Long = monitoredData.count()

    if (count <= greaterThan) {
      throw new ConditionNotMetException
    }
  }
}
```

First thing you will notice is that we are using an `ArgmapConfiguration` to parse our input arguments, which will be presented below. We are first loading a few variables from our args:
 
- `local`, a setting telling Spark if it should run in local mode or not;
- `inputLocation`, where our data is loaded from;
- `greaterThat`, this will be the threshold that needs to be exceeded for the email notification to get triggerred.

Then, we take all other arguments for our job and treat them as filters that we need to apply to our data. Once we have all our configuration, we initialize the Spark session, where we include schema inference and some sensible defaults regarding partitions and parallelism. Then, we load the monitored data from the input location. Next, we take every filter value from the input arguments and we filter our data. Here, the `ArgmapConfiguration` again comes to our aid, parsing a list of desired values from an input argument.

After filtering all the data we should end up with the actual data we are monitoring. We count what remains in the dataframe and compare that count to the configured `greaterThan` treshold. This jobs' intended use is to monitor and get a notification once data starts appearing in our system for a specific device or a specific configuration. This is why zero is the default value of the threshold, but we can configure it if we want to only start processing data for a device once we have a specific number of recordings.

You will now notice something unusual here. If the threshold is not reached, the Spark job throws a `ConditionNotMetException`. This will fail the job. If the conditions are met, the job does not throw the exception, so the job does not fail. We do this because in Oozie a Spark job ends in two ways, a success or a failure. We can then branch based on the success and failure of the jobs. This is a limitation but we can design our monitoring jobs to work with this and obtain the desired behavior.
